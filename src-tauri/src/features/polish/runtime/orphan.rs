use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use super::PolishRuntimeConfig;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
struct ServerRecord {
    server_pid: u32,
    owner_pid: u32,
}

struct Launch<'a> {
    echo_pid: u32,
    echo_executable: &'a Path,
    server_executable: &'a Path,
}

pub(super) fn record_server(record_path: &Path, server_pid: Option<u32>) {
    let Some(server_pid) = server_pid else {
        return;
    };
    let record = ServerRecord {
        server_pid,
        owner_pid: std::process::id(),
    };
    if let Err(error) = write_record(record_path, record) {
        log::warn!("Could not record the Polish server process: {error:#}");
    }
}

fn write_record(record_path: &Path, record: ServerRecord) -> Result<()> {
    fs::write(record_path, serde_json::to_vec(&record)?)?;
    Ok(())
}

fn read_record(record_path: &Path) -> Option<ServerRecord> {
    serde_json::from_slice(&fs::read(record_path).ok()?).ok()
}

/// A crash or force quit runs no shutdown code, and the server it leaves keeps the model in memory.
pub(in crate::features::polish) fn stop_orphaned_server(config: &PolishRuntimeConfig) {
    let Some(record) = read_record(&config.server_record) else {
        return;
    };
    let Ok(echo_executable) = std::env::current_exe() else {
        return;
    };
    let launch = Launch {
        echo_pid: std::process::id(),
        echo_executable: &echo_executable,
        server_executable: &config.server_path,
    };
    if !is_orphaned_server(record, &launch, executable_of) {
        return;
    }
    log::warn!(
        "Stopping the Polish server a previous Echo left running (pid {})",
        record.server_pid
    );
    stop_process(record.server_pid);
    let _ = fs::remove_file(&config.server_record);
}

/// A pid is reused after a reboot or a long uptime, so only the executable behind it counts.
fn is_orphaned_server(
    record: ServerRecord,
    launch: &Launch<'_>,
    executable_of: impl Fn(u32) -> Option<PathBuf>,
) -> bool {
    let runs = |pid: u32, executable: &Path| {
        executable_of(pid).is_some_and(|running| is_same_file(&running, executable))
    };
    let owner_is_running =
        record.owner_pid != launch.echo_pid && runs(record.owner_pid, launch.echo_executable);
    !owner_is_running && runs(record.server_pid, launch.server_executable)
}

fn is_same_file(left: &Path, right: &Path) -> bool {
    let resolved = |path: &Path| fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    resolved(left) == resolved(right)
}

#[cfg(target_os = "macos")]
fn executable_of(pid: u32) -> Option<PathBuf> {
    use std::os::unix::ffi::OsStringExt;

    let pid = libc::c_int::try_from(pid).ok()?;
    let mut buffer = vec![0_u8; usize::try_from(libc::PROC_PIDPATHINFO_MAXSIZE).ok()?];
    let capacity = u32::try_from(buffer.len()).ok()?;
    // SAFETY: the kernel writes at most `capacity` bytes into a buffer of that size.
    let written = unsafe { libc::proc_pidpath(pid, buffer.as_mut_ptr().cast(), capacity) };
    let length = usize::try_from(written).ok().filter(|length| *length > 0)?;
    buffer.truncate(length);
    Some(PathBuf::from(std::ffi::OsString::from_vec(buffer)))
}

#[cfg(all(unix, not(target_os = "macos")))]
fn executable_of(pid: u32) -> Option<PathBuf> {
    fs::read_link(format!("/proc/{pid}/exe")).ok()
}

#[cfg(unix)]
fn stop_process(pid: u32) {
    let Ok(pid) = libc::pid_t::try_from(pid) else {
        return;
    };
    // SAFETY: kill takes two integers and touches no memory of this process.
    if unsafe { libc::kill(pid, libc::SIGKILL) } != 0 {
        log::warn!(
            "Could not stop the orphaned Polish server: {}",
            std::io::Error::last_os_error()
        );
    }
}

#[cfg(windows)]
fn executable_of(pid: u32) -> Option<PathBuf> {
    use std::os::windows::ffi::OsStringExt;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };

    let mut buffer = [0_u16; 1024];
    let mut length = u32::try_from(buffer.len()).ok()?;
    // SAFETY: the handle is closed before returning and `length` is the size of `buffer`.
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let queried = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            windows::core::PWSTR(buffer.as_mut_ptr()),
            &mut length,
        );
        let _ = CloseHandle(handle);
        queried.ok()?;
    }
    let path = buffer.get(..usize::try_from(length).ok()?)?;
    Some(PathBuf::from(std::ffi::OsString::from_wide(path)))
}

#[cfg(windows)]
fn stop_process(pid: u32) {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE};

    // SAFETY: the handle is used only while open and closed before returning.
    let stopped = unsafe {
        OpenProcess(PROCESS_TERMINATE, false, pid).and_then(|handle| {
            let terminated = TerminateProcess(handle, 1);
            let _ = CloseHandle(handle);
            terminated
        })
    };
    if let Err(error) = stopped {
        log::warn!("Could not stop the orphaned Polish server: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ECHO: &str = "/app/echo";
    const SERVER: &str = "/app/llama-server";
    const OTHER_PROGRAM: &str = "/usr/bin/vim";
    const RECORD: ServerRecord = ServerRecord {
        server_pid: 41,
        owner_pid: 7,
    };

    fn is_orphan(record: ServerRecord, running: &[(u32, &str)]) -> bool {
        let launch = Launch {
            echo_pid: 900,
            echo_executable: Path::new(ECHO),
            server_executable: Path::new(SERVER),
        };
        is_orphaned_server(record, &launch, |pid| {
            running
                .iter()
                .find(|(running_pid, _)| *running_pid == pid)
                .map(|(_, executable)| PathBuf::from(executable))
        })
    }

    #[test]
    fn a_server_left_by_an_echo_that_is_gone_is_stopped() {
        assert!(is_orphan(RECORD, &[(41, SERVER)]));
    }

    #[test]
    fn a_server_whose_echo_is_still_running_is_left_alone() {
        assert!(!is_orphan(RECORD, &[(41, SERVER), (7, ECHO)]));
    }

    #[test]
    fn a_recorded_pid_now_used_by_another_program_is_left_alone() {
        assert!(!is_orphan(RECORD, &[(41, OTHER_PROGRAM)]));
    }

    #[test]
    fn a_server_that_already_exited_is_left_alone() {
        assert!(!is_orphan(RECORD, &[]));
    }

    #[test]
    fn another_program_reusing_the_dead_echos_pid_does_not_protect_the_server() {
        assert!(is_orphan(RECORD, &[(41, SERVER), (7, OTHER_PROGRAM)]));
    }

    #[test]
    fn this_launch_reusing_the_dead_echos_pid_does_not_protect_the_server() {
        let record = ServerRecord {
            server_pid: 41,
            owner_pid: 900,
        };

        assert!(is_orphan(record, &[(41, SERVER), (900, ECHO)]));
    }

    #[cfg(unix)]
    #[test]
    fn the_next_launch_kills_the_server_a_dead_echo_left_running() {
        use std::os::unix::process::ExitStatusExt;
        use std::process::Command;

        let directory = tempfile::tempdir().unwrap();
        let mut server = Command::new("/bin/sleep").arg("60").spawn().unwrap();
        let mut dead_echo = Command::new("/bin/sleep").arg("0").spawn().unwrap();
        dead_echo.wait().unwrap();
        let config = PolishRuntimeConfig {
            server_path: PathBuf::from("/bin/sleep"),
            working_directory: PathBuf::new(),
            model_path: PathBuf::new(),
            server_record: directory.path().join("polish-server.json"),
            server_log: PathBuf::new(),
        };
        let record = ServerRecord {
            server_pid: server.id(),
            owner_pid: dead_echo.id(),
        };
        write_record(&config.server_record, record).unwrap();

        stop_orphaned_server(&config);

        assert_eq!(server.wait().unwrap().signal(), Some(libc::SIGKILL));
        assert!(!config.server_record.exists());
    }
}

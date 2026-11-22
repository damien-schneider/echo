use super::DirectSelection;

#[cfg(any(target_os = "windows", test))]
const WINDOWS_TERMINALS: &[&str] = &[
    "alacritty",
    "bash",
    "cmd",
    "conemu",
    "conemu64",
    "conhost",
    "hyper",
    "mintty",
    "openconsole",
    "powershell",
    "pwsh",
    "tabby",
    "warp",
    "wezterm-gui",
    "windowsterminal",
    "wsl",
];

#[cfg(any(target_os = "linux", test))]
const LINUX_TERMINALS: &[&str] = &[
    "alacritty",
    "cool-retro-term",
    "deepin-terminal",
    "ghostty",
    "gnome-terminal",
    "gnome-terminal-server",
    "guake",
    "hyper",
    "kgx",
    "kitty",
    "konsole",
    "lxterminal",
    "mate-terminal",
    "ptyxis",
    "qterminal",
    "roxterm",
    "rxvt",
    "sakura",
    "st",
    "tabby",
    "terminator",
    "terminology",
    "tilda",
    "tilix",
    "urxvt",
    "urxvtd",
    "uxterm",
    "warp",
    "warp-terminal",
    "wezterm-gui",
    "xfce4-terminal",
    "xterm",
    "yakuake",
];

/// A terminal reads the copy shortcut as an interrupt, so a selection it does not prove settles as nothing to copy.
pub(super) fn settled_in_terminal(observed: DirectSelection, in_terminal: bool) -> DirectSelection {
    match observed {
        DirectSelection::Empty | DirectSelection::Unavailable if in_terminal => {
            DirectSelection::NothingSelected
        }
        observed => observed,
    }
}

#[cfg(any(target_os = "windows", test))]
pub(super) fn is_windows_terminal(process_name: &str) -> bool {
    let name = process_name.to_ascii_lowercase();
    let name = name.strip_suffix(".exe").unwrap_or(&name);
    WINDOWS_TERMINALS.contains(&name)
}

#[cfg(any(target_os = "linux", test))]
pub(super) fn is_linux_terminal(process_name: &str) -> bool {
    LINUX_TERMINALS.contains(&process_name.trim().to_ascii_lowercase().as_str())
}

/// `comm` cuts names at 15 bytes (gnome-terminal-server) and `exe` names the interpreter of script terminals (terminator), so both are tried.
#[cfg(target_os = "linux")]
pub(super) fn is_terminal_process(pid: u32) -> bool {
    let comm = std::fs::read_to_string(format!("/proc/{pid}/comm")).ok();
    let exe = std::fs::read_link(format!("/proc/{pid}/exe"))
        .ok()
        .and_then(|path| Some(path.file_name()?.to_str()?.to_owned()));
    comm.into_iter()
        .chain(exe)
        .any(|name| is_linux_terminal(&name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_terminals_are_recognised_by_their_executable() {
        for name in [
            "WindowsTerminal.exe",
            "OpenConsole.exe",
            "conhost.exe",
            "CMD.EXE",
            "powershell.exe",
            "pwsh",
            "wezterm-gui.exe",
            "ConEmu64.exe",
            "Warp.exe",
        ] {
            assert!(is_windows_terminal(name), "{name}");
        }
        for name in ["notepad.exe", "Code.exe", "chrome.exe", "", ".exe"] {
            assert!(!is_windows_terminal(name), "{name}");
        }
    }

    #[test]
    fn linux_terminals_are_recognised_by_their_process_name() {
        for name in [
            "xterm",
            "gnome-terminal-server",
            "Kitty",
            "konsole\n",
            "st",
            "ghostty",
            "xfce4-terminal",
        ] {
            assert!(is_linux_terminal(name), "{name}");
        }
        for name in ["firefox", "code", "gnome-terminal-", "stalonetray", ""] {
            assert!(!is_linux_terminal(name), "{name}");
        }
    }

    /// The copy shortcut would interrupt the terminal's process, so an unproven read there must not fall back to it.
    #[test]
    fn a_terminal_without_a_proven_selection_has_nothing_to_copy() {
        assert_eq!(
            settled_in_terminal(DirectSelection::Empty, true),
            DirectSelection::NothingSelected
        );
        assert_eq!(
            settled_in_terminal(DirectSelection::Unavailable, true),
            DirectSelection::NothingSelected
        );
        assert_eq!(
            settled_in_terminal(DirectSelection::Text("ls".to_owned()), true),
            DirectSelection::Text("ls".to_owned())
        );
        assert_eq!(
            settled_in_terminal(DirectSelection::Empty, false),
            DirectSelection::Empty
        );
        assert_eq!(
            settled_in_terminal(DirectSelection::Unavailable, false),
            DirectSelection::Unavailable
        );
    }
}

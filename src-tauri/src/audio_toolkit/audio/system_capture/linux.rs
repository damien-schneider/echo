//! Linux system audio capture via PulseAudio monitor source.
//!
//! Connecting to `<default-sink>.monitor` works against both real PulseAudio
//! and PipeWire's `pipewire-pulse` shim, which is the default on every modern
//! desktop distro. We resample 48 kHz mono → 16 kHz mono inside the read
//! callback so the public channel only carries Whisper-ready audio.

use anyhow::{anyhow, Context, Result};
use log::{debug, warn};
use std::cell::RefCell;
use std::ops::Deref;
use std::rc::Rc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use libpulse_binding::{
    context::{Context as PaContext, FlagSet as CtxFlagSet, State as CtxState},
    mainloop::threaded::Mainloop,
    proplist::Proplist,
    sample::{Format as SampleFormat, Spec as SampleSpec},
    stream::{FlagSet as StreamFlagSet, PeekResult, State as StreamState, Stream},
};

use super::SystemAudioCapture;
use crate::audio_toolkit::audio::FrameResampler;

const NATIVE_SAMPLE_RATE: u32 = 48_000;
const TARGET_SAMPLE_RATE: u32 = 16_000;

pub struct LinuxSystemCapture {
    shutdown: Arc<AtomicBool>,
    worker: Option<thread::JoinHandle<()>>,
}

impl LinuxSystemCapture {
    pub fn new() -> Result<Self> {
        Ok(Self {
            shutdown: Arc::new(AtomicBool::new(false)),
            worker: None,
        })
    }
}

impl SystemAudioCapture for LinuxSystemCapture {
    fn start(&mut self) -> Result<mpsc::Receiver<Vec<f32>>> {
        let (tx, rx) = mpsc::channel::<Vec<f32>>();
        let shutdown = self.shutdown.clone();
        shutdown.store(false, Ordering::SeqCst);

        let handle = thread::Builder::new()
            .name("pulse-monitor".into())
            .spawn(move || {
                if let Err(e) = capture_loop(tx, shutdown) {
                    warn!("PulseAudio monitor capture exited with error: {e:#}");
                }
            })
            .context("spawn pulse-monitor thread")?;

        self.worker = Some(handle);
        debug!("Linux system audio (PulseAudio monitor) capture started");
        Ok(rx)
    }

    fn stop(&mut self) -> Result<()> {
        self.shutdown.store(true, Ordering::SeqCst);
        if let Some(h) = self.worker.take() {
            let _ = h.join();
        }
        debug!("Linux system audio capture stopped");
        Ok(())
    }

    fn is_available() -> bool {
        // We can't reliably probe Pulse/PipeWire from a simple bool here, so we
        // optimistically advertise availability and let start() surface failure.
        true
    }
}

pub fn is_available() -> bool {
    LinuxSystemCapture::is_available()
}

pub fn create() -> Result<Box<dyn SystemAudioCapture>> {
    Ok(Box::new(LinuxSystemCapture::new()?))
}

fn capture_loop(tx: mpsc::Sender<Vec<f32>>, shutdown: Arc<AtomicBool>) -> Result<()> {
    let mut proplist = Proplist::new().ok_or_else(|| anyhow!("Pulse: Proplist::new failed"))?;
    proplist
        .set_str(libpulse_binding::proplist::properties::APPLICATION_NAME, "echo")
        .map_err(|_| anyhow!("Pulse: set application.name failed"))?;

    let mainloop = Rc::new(RefCell::new(
        Mainloop::new().ok_or_else(|| anyhow!("Pulse: Mainloop::new failed"))?,
    ));
    let context = Rc::new(RefCell::new(
        PaContext::new_with_proplist(
            mainloop.borrow().deref(),
            "echo-system-capture",
            &proplist,
        )
        .ok_or_else(|| anyhow!("Pulse: Context::new_with_proplist failed"))?,
    ));

    {
        let ml_ptr = Rc::downgrade(&mainloop);
        let ctx_weak = Rc::downgrade(&context);
        context
            .borrow_mut()
            .set_state_callback(Some(Box::new(move || {
                if let (Some(ml), Some(ctx)) = (ml_ptr.upgrade(), ctx_weak.upgrade()) {
                    let st = ctx.borrow().get_state();
                    if matches!(st, CtxState::Ready | CtxState::Failed | CtxState::Terminated) {
                        // SAFETY: PA's threaded mainloop serializes state-callback
                        // invocations under its own lock; we hold the lock at
                        // the wait-loop above before signal() races with us.
                        // RefCell::as_ptr gives us a *mut Mainloop directly,
                        // so reborrow into &mut. Avoid `borrow_mut()` here:
                        // pulling `BorrowMut` into scope would steal method
                        // resolution for every Rc<RefCell<_>>.borrow_mut()
                        // elsewhere in this module.
                        unsafe {
                            (&mut *ml.as_ptr()).signal(false);
                        }
                    }
                }
            })));
    }

    context
        .borrow_mut()
        .connect(None, CtxFlagSet::NOFLAGS, None)
        .context("Pulse: Context::connect")?;
    mainloop.borrow_mut().start().context("Pulse: Mainloop::start")?;

    // Wait for context Ready
    mainloop.borrow_mut().lock();
    loop {
        match context.borrow().get_state() {
            CtxState::Ready => break,
            CtxState::Failed | CtxState::Terminated => {
                mainloop.borrow_mut().unlock();
                anyhow::bail!("Pulse: context failed to connect");
            }
            _ => mainloop.borrow_mut().wait(),
        }
    }
    mainloop.borrow_mut().unlock();

    // Resolve default sink → monitor source name
    let default_sink: Rc<RefCell<Option<String>>> = Rc::new(RefCell::new(None));
    {
        let ml_ptr = Rc::downgrade(&mainloop);
        let cell = default_sink.clone();
        mainloop.borrow_mut().lock();
        let _op = context.borrow().introspect().get_server_info(move |info| {
            if let Some(name) = info.default_sink_name.as_ref() {
                *cell.borrow_mut() = Some(name.to_string());
            }
            if let Some(ml) = ml_ptr.upgrade() {
                // SAFETY: introspector callback runs on the mainloop thread
                // under PA's internal lock. Reborrow the *mut Mainloop from
                // RefCell::as_ptr into a &mut to call signal(); see the
                // identical pattern in the state callback above.
                unsafe {
                    (&mut *ml.as_ptr()).signal(false);
                }
            }
        });
        while default_sink.borrow().is_none() {
            mainloop.borrow_mut().wait();
        }
        mainloop.borrow_mut().unlock();
    }
    let monitor = format!(
        "{}.monitor",
        default_sink
            .borrow()
            .clone()
            .ok_or_else(|| anyhow!("Pulse: default sink unavailable"))?
    );

    // Build record stream
    let spec = SampleSpec {
        format: SampleFormat::F32le,
        channels: 1,
        rate: NATIVE_SAMPLE_RATE,
    };
    if !spec.is_valid() {
        anyhow::bail!("Pulse: invalid sample spec");
    }

    mainloop.borrow_mut().lock();
    let stream = Rc::new(RefCell::new(
        Stream::new(&mut context.borrow_mut(), "monitor-capture", &spec, None)
            .ok_or_else(|| anyhow!("Pulse: Stream::new failed"))?,
    ));

    // Resampler shared between thread + read callback (callback runs on
    // mainloop thread; we own the stream from this thread under the lock).
    let resampler = Rc::new(RefCell::new(FrameResampler::new(
        NATIVE_SAMPLE_RATE as usize,
        TARGET_SAMPLE_RATE as usize,
        Duration::from_millis(100),
    )));

    {
        let s = stream.clone();
        let tx = tx.clone();
        let rs = resampler.clone();
        stream.borrow_mut().set_read_callback(Some(Box::new(move |_nbytes| {
            let mut s = s.borrow_mut();
            loop {
                match s.peek() {
                    Ok(PeekResult::Empty) => break,
                    Ok(PeekResult::Hole(_)) => {
                        let _ = s.discard();
                    }
                    Ok(PeekResult::Data(buf)) => {
                        let n = buf.len() / 4;
                        let mut samples = Vec::with_capacity(n);
                        for i in 0..n {
                            let b = [
                                buf[i * 4],
                                buf[i * 4 + 1],
                                buf[i * 4 + 2],
                                buf[i * 4 + 3],
                            ];
                            samples.push(f32::from_le_bytes(b));
                        }
                        let mut rs = rs.borrow_mut();
                        let tx = tx.clone();
                        rs.push(&samples, |frame| {
                            let _ = tx.send(frame.to_vec());
                        });
                        let _ = s.discard();
                    }
                    Err(_) => break,
                }
            }
        })));
    }

    let flags = StreamFlagSet::ADJUST_LATENCY | StreamFlagSet::AUTO_TIMING_UPDATE;
    stream
        .borrow_mut()
        .connect_record(Some(&monitor), None, flags)
        .context("Pulse: connect_record")?;

    // Wait for stream Ready
    loop {
        match stream.borrow().get_state() {
            StreamState::Ready => break,
            StreamState::Failed | StreamState::Terminated => {
                mainloop.borrow_mut().unlock();
                anyhow::bail!("Pulse: stream failed");
            }
            _ => mainloop.borrow_mut().wait(),
        }
    }
    mainloop.borrow_mut().unlock();

    // Run until shutdown is signalled.
    while !shutdown.load(Ordering::Relaxed) {
        thread::sleep(Duration::from_millis(100));
    }

    // Tear down inside the lock.
    mainloop.borrow_mut().lock();
    let _ = stream.borrow_mut().disconnect();
    mainloop.borrow_mut().unlock();
    mainloop.borrow_mut().stop();
    Ok(())
}

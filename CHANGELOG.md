# Changelog

## [0.7.2] - 2026-08-19

### Added
- Enter finishes a recording and pastes it, next to the shortcut set up for it and the overlay's own button.

### Changed
- The panel holding a transcript with nowhere to land counts itself out instead of waiting to be closed: a few seconds to read it, two once it has been copied.

### Fixed
- A dictation spoken into a text field is pasted into it even when the recording is finished from the overlay's button: the caret is read when the dictation starts, not after a click has moved the focus around.

## [0.7.1] - 2026-08-19

### Added
- Chat has a microphone: what is dictated there lands in the composer, appended to what is already typed, instead of being pasted into the app behind.
- A transcript with nowhere to land — nothing focused to paste into — is held out in a panel with copy and send-to-chat instead of disappearing. Sent to chat, it is asked as it stands, once the selected text it may be about has been read.

### Changed
- Overlay hover no longer needs a panel to take the keyboard: the native pointer paints the whole element chain, so the notch controls react without pulling focus out of the app being worked in.
- Chat sends the reference it is showing, instead of re-reading the selection behind the user at send time.

## [0.7.0] - 2026-08-18

### Added
- Answers from the bundled Echo 4B model stream in as they are written, instead of appearing all at once when generation ends.
- Chat answers render as formatted markdown: headings, lists, tables, links, and syntax-highlighted code blocks with a copy button.
- A pending answer can be stopped, which also stops the local model instead of leaving it generating in the background.

### Changed
- A sent message and its thinking state appear immediately, without waiting for the selected-text lookup that travels with it.
- The composer stays typable while an answer streams in, and the conversation follows that answer only while the reader is at the bottom.

## [0.6.0] - 2026-08-17

### Added
- Chat runs on the bundled Echo 4B model, offers its 2.5 GB download inline, and keeps custom local and cloud providers selectable.
- Chat carries the text selected in the frontmost app as context and keeps that reference through prompt refreshes, sending it with the conversation history.

### Changed
- Recording, transcription and chat share one notch-attached shell, with icon-only finish and dismiss controls in the hardware flanks.
- Parakeet is gone from the model catalogue, the site and the README: Echo ships Whisper Small, Medium and Large.

### Fixed
- Text selected in a terminal or an editor is read before the overlay takes focus, instead of being lost to a copy shortcut answered too slowly.
- Chat opens before Echo 4B has started and recovers the requests made while its listeners were still coming up.
- Chat keeps message selection on the text itself and stays overflow-free on narrow screens.
- Echo 4B repair starts visibly and reports the recovery reason; development and production share one verified model store, and the packaged runtime is validated before launch.

## [0.5.0] - 2026-07-26

### Added
- **Polish**: proofread the current selection with a local model. A llama.cpp server ships with the app, binds to loopback behind a per-run key, and never sends the text anywhere.
- Recording activity now provides an explicit action to finish and transcribe the captured audio.

### Changed
- The Polish model is released after ten idle minutes and reloaded on the next correction, instead of holding its weights for the life of the app.
- The Polish server runs on half the machine's cores, capped at eight, so a correction no longer competes with whatever the user is doing.
- Side-docked overlay controls stay visible in a compact vertical toolbar that trims idle padding and expands smoothly on hover.
- Right-docked resident controls keep their screen-edge inset while expanding and reliably release hover after native or DOM pointer exit.
- Resident controls use smaller square-rounded action buttons, a muted always-visible six-dot drag handle without button-like hover feedback, and an inset border instead of a clipped outer shadow.
- Dragging the resident HUD now previews its nearest dock target, keeps classic 10px corner and inverse-edge radii flush to the screen, centers the grip and three controls, and avoids snap flicker near corners.
- Recording, transcription, polishing, and chat now open from a top-center notch HUD while resident controls remain docked; the HUD joins the physical Mac notch when present, expands for live transcript text, and traces activity gradients around its edge without filling the center.
- Long dictation pauses retain a bounded silence separator and trigger a quality batch decode at stop, preserving speech from every utterance without making short recordings slower.

### Fixed
- Polish no longer reports "No text selected" when the selection lives in a terminal or an editor that answers the copy shortcut slowly.
- The clipboard is restored after a Polish on macOS: legacy pasteboard type names the system refuses to write back are no longer part of the snapshot.
- A clipboard that cannot be put back is logged instead of costing the user the correction they asked for.

## [0.3.0] - 2025-07-11

### Added
- **Translate to English** setting: Added automatic translation of speech to English
- Settings refactored into React hooks for better state management
- Audio device switching capability
- Hysteresis to VAD (Voice Activity Detection) for more stable recording

### Changed
- Major audio backend refactor for improved performance and reliability
- Moved audio toolkit into src-tauri directory for better permissions handling
- Model files no longer need to be downloaded separately for releases
- Updated settings components and transcription logic

### Fixed
- Audio toolkit permissions issues
- Various stability improvements

## [0.2.3] - 2025-07-03

### Fixed
- Keycode bug that was causing input issues
- Whisper model optimization: switched to unquantized Whisper Turbo, updated Whisper Medium quantization to 4_1

## [0.2.2] - 2025-07-02

### Fixed
- Removed 50ms delay feature flag for Windows (now applies to all platforms for consistency)

## [0.2.1] - 2025-07-01

### Added
- Ctrl+Space key binding for Windows platform

### Fixed
- Windows crash issue
- Model loading on startup when available
- Windows paste functionality bug

## [0.2.0] - 2025-06-30

### Added
- **Microphone activation on demand**: More efficient resource usage
- Less permissive VAD settings for better accuracy

### Changed
- Improved microphone management and activation system

## [0.1.6] - 2025-06-30

### Added
- **Multiple models support**: Users can now select from different transcription models
- Model selection onboarding flow
- Cleanup and refactoring of model management

### Changed
- Enhanced user experience with model selection interface
- Better language and UI tweaks

## [0.1.5] - 2025-06-27

### Added
- **Different start and stop recording sounds**: Enhanced audio feedback
- Recording sound samples for better user experience

## [0.1.4] - 2025-06-27

### Fixed
- Build issues
- Auto-update functionality improvements

## [0.1.3] - 2025-06-26

### Fixed
- Paste functionality using enigo library for better cross-platform compatibility

## [0.1.2] - 2025-06-26

### Added
- **Auto-update functionality**: Application can now automatically update itself
- Footer displaying current version
- Improved menu system

### Changed
- Better user interface for version management
- Enhanced update workflow

## [0.1.1] - 2025-06-25

### Added
- **Comprehensive build system**: Support for Windows, macOS, and Linux
- Windows code signing for trusted installation
- Ubuntu/Linux build support with Vulkan
- Model file download and packaging for releases
- GitHub Actions CI/CD workflow

### Changed
- Improved build process and release workflow
- Better cross-platform compatibility

### Fixed
- Various build-related issues across platforms

## [0.1.0] - 2025-05-16

### Added
- **Initial release** of Echo
- Basic speech-to-text transcription functionality
- Voice Activity Detection (VAD) for automatic recording
- Cross-platform support (macOS, Windows, Linux)
- **Tauri-based desktop application** with React frontend
- **Global keyboard shortcuts** for activation
- **Clipboard integration** for automatic text insertion
- **LLM integration** for enhanced transcription processing
- **Configurable settings** including:
  - Custom key bindings
  - Audio device selection
  - Microphone settings
  - Push-to-talk functionality
- **System tray integration** with recording indicators
- **Accessibility permissions** handling for macOS
- **Settings persistence** with unified settings store
- **Background operation** capability
- **Multiple audio format support** with on-the-fly resampling
- **Whisper model integration** for high-quality transcription
- **MIT License** for open-source distribution

### Technical Implementation
- Built with Tauri (Rust backend) and React (TypeScript frontend)
- Audio processing with cpal and whisper-rs
- Real-time transcription with performance optimizations
- Cross-platform keyboard event handling
- Modular architecture with managers for audio, models, and transcription

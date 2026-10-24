# Changelog

## [0.8.14] - 2026-10-24

### Changed
- When the settings window is narrower than 768 px and the sidebar is hidden, the content panel fills the window edge to edge instead of keeping its margin and rounded corners.

## [0.8.13] - 2026-10-24

### Added
- The Models page has a Meetings section with Voxtral Realtime (2.8 GB) and Speaker detection (470 MB). Each row shows its disk size and downloads from there; once downloaded it has buttons to show its file in Finder and to delete it. On a Mac that can't run Voxtral Realtime, its row says it needs an Apple Silicon Mac with 16 GB of memory instead of offering a download.
- A Storage section on the Models page lists "Files from older versions": models that earlier versions of Echo downloaded and this version never uses, with their total size, a button to show them in Finder, and Delete.
- A transcription or meeting model whose download was interrupted says how far it got, for example "472 MB of 574 MB downloaded". Its button reads Resume and continues from there, and the partial file can be shown in Finder or deleted.

### Changed
- Meeting settings no longer download or delete the meeting models: a Meeting models row opens the Models page, and messages about a missing meeting model point there too.
- Deleting a capture, a history entry, a keyboard entry or a model, and Keyboard's Clear All, share the same confirmation: the button turns red and asks for a second click within three seconds. Every delete button now has a name that screen readers announce.
- A model can't be deleted while a meeting is recording; Echo asks to stop the meeting first.

### Fixed
- When the model finishes downloading from the "Download the Small model to dictate" prompt while the welcome screen is open, the welcome screen gives way to settings. It used to stay up with the model marked Active and no button to continue.
- Toggling dictation with SIGUSR2 keeps working after a dictation that could not start, for example while the model is missing. It used to stop responding to the signal until Echo restarted.

## [0.8.12] - 2026-10-24

### Added
- Each model on the Models page shows its disk size and how much memory it takes while running, measured on Apple silicon: Small 469 MB, Medium 857 MB, Large 1.7 GB, Qwen3 4B 3.1 GB. A downloaded model has buttons to show its file in Finder and to delete it. Delete asks for a second click and also works on the active transcription model and on Qwen3 4B, which are unloaded from memory first.

### Changed
- The on-device model is shown only on the Models page, under its real name, Qwen3 4B, with what runs on it: post-processing, voice commands, Polish, meeting summaries and chat. The Post-processing page no longer has its own model row, and chat, meeting settings and error messages say Qwen3 4B instead of Echo 4B.
- The Models page has a Transcription section and a Language model section, and Small, Medium, Large and Qwen3 4B share one layout. The "Local transcription ready" banner is gone: the Active badge marks the chosen model, and a model loading into memory says so on its own row.
- Model sizes use decimal units like Finder, so Qwen3 4B reads 2.5 GB on the Models page too.

### Fixed
- A dragged island stays the length it has when docked, instead of growing extra space above its first button and below its last.

## [0.8.11] - 2026-10-24

### Added
- Hovering the docked island grows a round settings button out of its end, joined to the panel by a soft neck; clicking it opens Echo's settings. On the top or bottom edge it appears once the actions are open.

### Changed
- The docked island has larger, smoother curves where it meets the screen edge and at its rounded ends. Its record, chat and Polish buttons are bigger round buttons that fill the panel's width, each on its own subtle fill so they stay apart before hovering.
- Dragging the island no longer adds an outline or dims its buttons: the lifted island looks like the docked one with its edge curves rounded off, and the drop preview is a translucent copy of the docked island instead of an outlined box.
- Letting go of the dragged island glides it into its dock instead of jumping there. It stays lifted on the way and settles against the edge once it arrives, and the drop preview stays until then. The drop preview lines up with the island instead of centering on the pointer, so the island glides straight in. It no longer slides in from where it was picked up or squeezes into a thin sliver when dropped on the opposite edge, and the settings button no longer pops out mid-flight.
- The About dialog's App Data Directory row matches the rows around it: its description sits under the title instead of behind an info icon.

### Removed
- Cloud AI providers (OpenAI, OpenRouter, Anthropic, Ollama and custom endpoints) and their provider, base URL, API key and model settings. Post-processing, voice commands, meeting summaries and chat always run on Echo 4B on this computer, so "Post-process in the cloud", "Summarize in the cloud", and chat's Local/Cloud switch and model picker are gone. API keys saved by earlier versions are deleted from the settings file on the next launch.

### Fixed
- The island's buttons light up as soon as the pointer reaches them. On macOS their hover fill used to show up almost half a second late and stay on the button the pointer had just left.

## [0.8.10] - 2026-10-24

### Changed
- The settings window's sidebar runs to the top of the window with the window buttons inside it, settings sit on a rounded panel with lighter borders, and the version moved to the sidebar footer.
- AI provider settings only appear when a cloud option is on: under "Post-process in the cloud" on the Post-processing page, and under "Summarize in the cloud" in Meeting settings. A summary that needs a provider now links to Meeting settings.
- The prompt editor's toolbar shows which formatting is on, and each button has a tooltip.
- Meeting settings use the same sections and rows as the other settings pages.
- Icons across the app use the Phosphor set.

### Fixed
- The default prompt's transcript placeholder shows as one @output chip instead of a stray "$", and opening a prompt no longer enables "Save changes" before anything is edited.
- Opening an app that isn't installed by voice now reports "Couldn't find an app named …" instead of "Opened …". On Windows it no longer opens the blocking "Windows cannot find" dialog or flashes a console window.
- Voice commands no longer show as "Active" while post-processing is off: the section says they need post-processing on and the commands show "Off".
- Sentences about changing a theme, such as "Tu peux changer de thème pour la soirée", are pasted as text instead of switching Echo's feedback sounds.

## [0.8.9] - 2026-10-24

### Added
- Post-processing and voice commands run on Echo 4B, the on-device model (a one-time 2.5 GB download, offered on the Post-processing page), so turning them on no longer needs an AI provider. "Post-process in the cloud" switches back to the configured provider, and setups that already had a provider model keep using it.

### Fixed
- Quitting Echo, or restarting it into an update, no longer ends in "Echo quit unexpectedly" while a speech model is loaded.
- Clicking Polish or chat on the island, or clicking into chat to send a new message, no longer pulls focus from the app being worked in, so its selected text stays selected and reaches Polish and chat.
- A dictation that only mentions a note or a theme, such as "note de frais", is pasted as text instead of triggering a voice command, and no longer comes out as raw tool-call text.
- A slow post-processing answer no longer pastes the dictation twice, or runs a voice command after the raw text was already pasted.
- A voice command runs once, even when the model asks for it twice.
- A dictation containing "$$" or "$&" reaches post-processing unchanged instead of being rewritten by the prompt template.

## [0.8.8] - 2026-10-24

### Added
- Meetings can run on Voxtral Mini 4B Realtime, an optional 2.8 GB download in Meeting settings for Apple Silicon Macs with 16 GB of memory. Once downloaded, the microphone's live text comes from Voxtral and is kept as the transcript at stop; retranscribing runs every track through it.

### Changed
- Speech recognition runs on transcribe.cpp instead of whisper-rs, on the same Whisper model files. A decode that runs past its time limit is now cancelled instead of left running.
- Live text stays on screen after stop until the final transcript replaces it, and the meeting opens by itself when it is done.
- Speaker labels start at 1, and live lines use the same "Speaker" and "Guest" labels as the stored transcript.
- Each track pins its own language, and short replies such as "OK" or "Merci" are kept in the transcript.

### Fixed
- A meeting interrupted by a crash, or stopped before the models were downloaded, is kept as a recording that can be transcribed later.
- Retranscribing keeps the previous transcript until the new one is ready, restores it when the new pass fails, and blocks starting a meeting while it runs.
- Without a transcription model, a meeting records without a live preview instead of logging a decode error five times a second.
- A guest heard through the speakers is no longer transcribed a second time from the microphone.
- A track with music and no speech no longer gets invented text.
- Overlapping speaker turns are transcribed once.

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

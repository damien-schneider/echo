# Changelog

## [0.8.23] - 2026-11-25

### Added
- Choose Qwen3 4B, Gemma 4 E2B, MiniCPM5-2B, or Ling 3.0 Tiny in Settings → Models. Each one states the languages its developer documents, and Chat shows which one is answering. Qwen stays selected by default. Echo checks free space, resumes interrupted downloads, and keeps the previous model selected until the new one is verified and running. Switching away from Qwen pauses voice commands but keeps dictation rewrites available.
- Turn on **Think** below the Chat message box for slower, more careful answers on supported models. It stays on for later questions until you turn it off; Polish and summaries still run without thinking.

### Changed
- The island docked to the top or bottom of the screen is easier to spot and to reach. At rest, the bar is 48 by 8 points instead of 38 by 5. The bar and the toolbar it opens into both sit 10 points from the edge instead of 4.

### Fixed
- Smaller models in Chat are less likely to reply that there is no text to work on when you ask about your selection: the selected text now goes in with your latest question instead of sitting in the model's instructions.

## [0.8.22] - 2026-11-21

### Changed
- The island lights up the moment the microphone is live, so you know when to start talking: two threads of light run down from the top of the island, along both sides, and meet underneath. From there, light drifts along its bottom edge, growing brighter, reaching higher up the sides and running faster as it hears your voice, and slowing down when you go quiet; background noise leaves it calm. When you finish, the same light carries on at its usual pace while Echo transcribes or polishes and settles into a steady drift, instead of switching to a different effect. Notices such as "No speech detected" stay unlit. With Reduce Motion on, the light appears without the opening sweep and holds still.
- On a Mac with a notch, a recording that has not heard a word yet stays beside the notch, with cancel on the left and finish on the right. The island opens below the notch once the first words appear.
- While the transcription model loads, the island no longer says "Preparing local model…". The finish button shows a spinning arc instead and can't be pressed yet. Once the microphone is live, the arc curls inward into a thin line that ripples with your voice for as long as you talk. Pointing at the island, or pausing briefly once words have appeared, folds the line into a plain, thin check, so you can see that finishing is one click away; speaking again turns it back into the wave. With Reduce Motion on, the arc holds still, the line swells with your voice without rippling along, and the check appears at once.
- Finishing a dictation is smoother. When you let go, the words stay exactly where they are and only the finish button fades away, instead of the whole island redrawing. When the island closes, the text blurs, lifts and fades while the island folds back into the notch over half a second. With Reduce Motion on, the island simply fades. The island starts closing only once the paste has gone out, so the closing animation no longer stutters at its start.
- The buttons on the island docked to the side of the screen no longer sit on grey discs. A disc appears only under the button you point at. While you record, the microphone button shows the same line that ripples with your voice as the island's finish button, instead of turning into a white disc. Pointing at the dock folds the line into a check, the same as on the island.
- The island docked to the top or bottom of the screen now floats just off the edge instead of touching it. At rest it is a small sliver; pointing at it opens a rounded toolbar with the settings button in its own small bubble beside it. Pushing the pointer against the screen edge next to it still opens it. The left and right docks stay attached to the edge as before.
- The chat panel now fits its conversation. It opens at a steady height with the message box at the bottom, grows with each message up to a set height, then older messages scroll, instead of jumping to a fixed tall panel as soon as you send. The caret is already in the message box when the chat opens, so you can type right away. The message box grows as you type over several lines: Enter sends and Shift+Enter starts a new line. While you type with an input method, for example Japanese or Chinese, Enter confirms the characters instead of sending. While an answer is being written, the message box is read-only; press Stop to type again.
- On macOS, the chat opens the moment you click it instead of after Echo has finished reading the selected text, which took close to a second when nothing was selected. It shows "Checking selected text…" meanwhile. Opening the chat while its model is already running no longer flashes "Loading" and blocks sending for a moment.
- The chat lights up like a dictation does. While Echo writes an answer, transcribes what you dictated into the chat or loads its model, the island's edge light pulses along its bottom edge the same way it follows your voice while you record. While you dictate into the chat, the light follows your voice and the microphone button shows the same line that ripples with your voice as the island's finish button. "Thinking…" now shimmers instead of showing a spinner, new messages fade in, and the send and stop buttons fade into each other.
- The chat's selected text is easier to read. With nothing selected, a single quiet line says "No text selected" instead of a large empty box. Selected text sits in its own card, up to three lines, labelled "Selected text" or "Clipboard text".
- Pointing at a prompt in the chat's prompt list highlights it with a soft light band and keeps the label readable, instead of turning the row almost white with white text on it. The chat's prompt, close, send and permission buttons also keep the island's dark look under the pointer and only brighten slightly.
- Echo's app icon is redrawn for current macOS. On macOS 26 and later it takes the Liquid Glass look and follows the Default, Dark, Clear and Tinted icon styles. In the Dock, the app switcher (Cmd+Tab) and Finder it is now the same size as other apps' icons instead of filling the whole slot. On Windows and Linux it keeps a small margin, like other apps' icons.
- While you dictate into the chat, your words appear in the message box as Echo hears them, instead of only once you finish.
- On macOS, an open chat now follows what you select in apps whose selection Echo cannot read directly, such as Zed. When you finish selecting with the mouse (a drag, a double or triple click, or a Shift-click), Echo copies the selection, shows it in the chat and puts your clipboard back. Moving or resizing a window does not count as selecting. Text highlighted by a program that captures the mouse inside a terminal cannot be read: hold the terminal's selection key, often Option or Shift, while you select.
- On Windows, the chat and Polish read the text you have selected directly from most apps and terminals, such as Windows Terminal, PowerShell and Command Prompt. Echo no longer sends Ctrl+C to a terminal, which could stop the program running in it.
- On Linux with X11, the chat and Polish read the text you have highlighted in the focused app, including terminals such as GNOME Terminal, Konsole, xterm and kitty. Echo no longer sends Ctrl+C to a terminal, which could stop the program running in it.
- Rounded corners now nest evenly across Echo. In the island, the chat, the Polish and transcript panels, settings groups, menus, popovers and dialogs, every inner corner follows its outer corner at the same distance, so buttons and cards no longer look pinched or loose in a corner. The chat's bottom corners follow its round message box, and the transcript and Polish panels sit slightly closer to their edges.

### Removed
- The "Top bar" and "Bottom bar" overlay options. The Overlay setting is now a single on/off switch, and the island can be dragged to any screen edge. If you used one of those options, Echo moves the island to the middle of that same edge.

### Fixed
- The island could close before your dictation was pasted, so in an app slow to take the paste nothing on screen showed the text was still coming. It now stays open until the paste has gone out.
- In Zed, opening the chat or running Polish with nothing selected took the whole line under the caret as the selected text, because Zed copies that line when nothing is selected. Polish then pasted the rewritten line at the caret, so the line appeared twice. Echo now treats it as nothing selected.
- Pasting a dictation longer than about 200 characters could fail or crash Echo when an accented letter or emoji fell on the 200th byte, because the paste log cut the text there.
- On macOS, the first dictation after Echo sat unused for hours could hold the island still for a moment as it opened, because macOS had suspended the island's hidden window and had to wake it first. The island's windows are no longer suspended while hidden.
- On macOS, when you started dragging the island, the drop preview popped in slightly smaller than the screen and bounced into place, so for its first frames it stopped short of the screen edge. It now appears in place from the first frame.
- Pointing at the island's cancel button (X), or other island buttons, could turn it into a light grey disc with the X barely visible. The buttons now keep the island's dark look and only lighten slightly under the pointer.

## [0.8.21] - 2026-11-20

### Added
- On macOS, shortcuts can use the Fn (🌐) key, alone or with other keys, for example `fn` or `fn+space`. They need Echo allowed in Accessibility. Without it, the shortcut is refused when you set it and the previous one stays. At launch it waits and turns on by itself once access is granted. Fn only works on keyboards that send it, such as Apple keyboards. Fn with an arrow, Home, End, Page Up, Page Down, forward Delete or an F-key is refused: macOS marks those keys as Fn even when Fn isn't held, so the shortcut would take over every press of that key.

### Changed
- A dictation that was heard but came back without text, or whose transcription failed or timed out, is saved to History with an empty transcript instead of disappearing. Retranscribe it from there. The island says "— kept in History".
- While you record a new shortcut, all of Echo's shortcuts are paused. Pressing another shortcut's keys no longer starts it, and the recording is refused with "'…' is already the … shortcut".
- A shortcut made of a single typing key, such as `space` or `a`, or one used only with shift, is refused because it would stop that key from typing in every app.
- Shortcuts are stored in one order, modifiers first, whatever order the keys were pressed in.
- A shortcut that could not be turned on at launch now says why and what to do, instead of always blaming another app.

### Fixed
- Recording a shortcut with Fn held recorded only the other key, so `fn+space` became `space`.
- Recording a shortcut that uses Command could keep waiting after every key was released.
- Page Up, Page Down, Caps Lock and the keypad's operator keys were recorded under names Echo could not register, so a shortcut using them was refused. Keys the system cannot identify are ignored instead of recorded as "unidentified".

## [0.8.20] - 2026-11-15

### Changed
- Rewriting a dictation and running a voice command now happen inside Echo itself instead of in the settings window, so they work the same with that window closed, reloading or busy. Cancelling a dictation stops them at once.
- Pressing the dictation shortcut while the previous dictation is still being transcribed or rewritten no longer starts a second recording on top of it. The island says "Still finishing the previous dictation — try again in a moment".
- After you allow the microphone in the macOS dialog, Echo asks you to press the shortcut again instead of starting to record on its own.
- On macOS, a dictation finished while Echo is not allowed in Accessibility no longer disappears without a word. The text is copied to the clipboard, the island says what to allow, and the Accessibility settings open once. This does not apply when Echo is set to only copy to the clipboard.
- Island warnings stay up for as long as they take to read, between 2 and 8 seconds. They used to leave after 2 seconds whatever their length.
- With the overlay hidden, a warning that explains why a dictation did not start or was not pasted is still shown. Progress stays hidden.
- A spoken reply stops when you start a new dictation or cancel the current one.
- Chat only sends what the local model can read. A long selection is cut to about 2,700 characters and marked as shortened, and in a long conversation the oldest turns are left out first. Before, a selection or conversation that was too long made the request fail.
- Opening chat again while it is already open starts a new conversation.
- Only one file is transcribed at a time. A second file is refused with a message, and when several files are dropped only the first is transcribed.
- A meeting cannot be deleted while it is being recorded or transcribed.
- The retention setting only removes meeting audio once the meeting has been transcribed.
- The log levels in Settings had their labels reversed, so choosing Error logged everything. The labels now match what is logged. Echo keeps logging at the level it was actually using; only the label changes.
- The log now says which microphone each recording was taken from, with its sample rate and channel count, so a recording that came out silent can be traced to its device.

### Fixed
- Dictation:
  - A dictation spoken quietly could be thrown away as silence, so nothing was pasted. Only a recording with no signal at all is skipped now.
  - Releasing the shortcut before the microphone had opened ended without a word. The island now says "Stopped before the microphone was ready", and "No speech detected" when a recording holds no speech.
  - When the microphone cannot be opened, the island says "Microphone unavailable — check your input device" and the dictation ends, instead of looking like it is recording. If the always-on microphone fails to open at launch, Echo still starts and tries again at the next dictation.
  - In toggle mode, the shortcut could get out of step after a start that failed or was cancelled. A press now always stops the recording in progress.
  - A message shown during a recording no longer hides the island when it disappears.
  - If rewriting a dictation takes longer than 30 seconds and Echo pastes what you said instead, that dictation is now saved to History too.
  - Changing the microphone in the middle of a dictation is refused instead of cutting the recording short.
  - A microphone choice or always-on setting that cannot be applied is no longer saved as if it had been.
  - The first dictation after a microphone was unplugged or reconnected failed. Echo now looks the microphone up again, and uses the default one when it is gone.
  - The island could show a recording that had already ended, and a notice's timer could hide the state that replaced it.
  - The island catches up with a dictation in progress when its window reloads.
  - If no screen was available when Echo started, the island is created at the next dictation instead of never appearing.
  - When Escape or Enter cannot be taken over by the island, Echo says so once instead of ignoring the key.
  - The menu bar icon went back to idle when the system theme changed during a recording.
- Voice commands and read aloud:
  - Saving a note with the same title as an existing one kept only the newest. Both are kept now.
  - Read aloud could fail on longer text containing accents or emoji.
  - A voice command that fails is now shown and spoken as a failure.
  - The voice command that switches feedback sounds no longer selects the Custom theme when there are no custom sounds.
- Chat:
  - A question that fails goes back into the message box instead of vanishing, and trying again no longer sends it twice.
  - Sending a message while the local model is downloading or loading now tells you so, and a dictated question waits for the model to be ready.
  - The conversation is kept when another notice briefly covers the chat.
  - An answer still arriving from a previous chat can no longer appear in the new one.
  - The local model is no longer switched off for the rest of the session after a rewrite or an answer that failed or took too long. It is only restarted when it has actually stopped responding.
  - Closing one notice could close a chat opened just after it.
  - Dictated text that cannot be sent to chat from its card now says so, and the card stays open while it is being sent.
- Settings and shortcuts:
  - A shortcut that cannot be registered, because another Echo action or another app already uses it, is no longer shown as changed. Echo says why and the previous shortcut keeps working.
  - Settings that cannot be read are no longer all reset. Only the unreadable ones go back to their default, and the original is kept as a backup.
  - A shortcut being edited is switched back on however the edit ends. Clicking another row or leaving the window mid-edit used to leave it off until Echo restarted.
  - A setting Echo refuses to apply now says why, and the control goes back to the value that was kept.
  - A settings file that cannot be read at all is kept as `settings_unreadable_backup.json` instead of being overwritten with defaults.
  - Changing the history limit or the retention period is undone when the cleanup that follows fails.
  - A shortcut that could not be registered showed its error twice.
- Models and first run:
  - A model download that fails from the island now says so on the island and can be retried.
  - A model can no longer be deleted while it is downloading, loading or transcribing.
  - A transcription model that fails to load now says which model, why, and what to do about it.
  - The language model can be deleted while it needs repair, and Repair checks the file again instead of trusting its earlier check.
  - A language-model server left running after a crash is stopped at the next launch, and what it reported before stopping is kept in the logs.
  - A model could stay shown as downloading or loading after it had finished.
  - The permission screens no longer wait forever for an answer. After about 30 seconds, or when you press Check again, they show the permission as denied and offer System Settings.
  - Errors raised during first-run setup are now shown.
- Meetings, History and files:
  - When system audio cannot be captured, the meeting says so instead of silently recording the microphone only.
  - A meeting recording that could not be closed properly is repaired so it still plays.
  - A dictation's text is saved to History even when its recording cannot be written, and two dictations saved in the same second no longer share one recording.
  - Transcribing a stereo file, or a file that isn't at 16 kHz, could feed scrambled or cut-off audio to the model, and 24-bit files came out far too quiet.
  - A transcribed file keeps its own name in History even when a dictation is saved at the same moment, and a failure to save it is reported.
  - A running meeting keeps its Stop button while you open, leave or delete a past meeting.
  - System audio that stops in the middle of a meeting, for example when the output device is unplugged, is now reported.
  - A retranscribe that fails or is interrupted leaves the previous transcript in place. Before, the meeting could be left with a mix of both.
  - A meeting that cannot be opened, deleted or listed now says why.
  - A History action that fails says why, and a History that cannot be loaded offers Retry instead of looking empty.
  - Progress or an error from one transcribed file could show up on another, and one failure could add several rows.

## [0.8.19] - 2026-11-15

### Added
- A Prompts page lists every prompt in one place: Correct, Natural and Clear (built in, read-only), Translate, and any prompt you write. Under Used by, you choose which prompt Dictation, Polish and Chat each use. Each one keeps its own choice, so setting Chat to Translate doesn't translate your next dictation.
- Translate, a new prompt that turns French into English and anything else into French. It works on dictations, on Polish, and in chat. Whole sentences translate well; a single ambiguous word can come back with the wrong meaning.
- Option/Alt+2 opens Echo chat with the text you have selected. You can change the shortcut in Shortcuts.
- In chat, the button on the left now picks the prompt. Typing / at the start of the message opens the same list. With a prompt chosen, the selected text is sent right away. Text taken from the clipboard is shown as a reference but never sent on its own.

### Changed
- Polish can use any prompt, not only the three levels. It still defaults to Natural.
- Rewrite before pasting is now the Dictation choice under Used by; Off pastes what you said as is. Your current setting and your saved prompts carry over.
- The Post-processing page is now called Prompts, and the Polish level slider is gone from Models.

### Removed
- The @output placeholder in prompts. The text a prompt works on is always passed separately, so a prompt only needs to say what to do.

## [0.8.18] - 2026-11-15

### Changed
- Dropdowns in Settings are now the same height as the buttons next to them, with slightly larger text.

### Fixed
- The startup screen now uses the theme you picked in Echo instead of always following the system theme.
- Updates after this one install more safely. On macOS, an update that fails to install no longer deletes Echo. On Linux, an AppImage update no longer fails when the temporary folder is on a different drive, and an update file that isn't an AppImage is rejected before it touches the installed app.

## [0.8.17] - 2026-11-01

### Fixed
- On Windows, holding the dictation shortcut down could start and stop dictation over and over, so nothing was pasted. Holding it now counts as one press.
- On Windows, the recording overlay could fall behind other apps. It comes back on top each time you switch apps and each time it appears.

## [0.8.16] - 2026-10-26

### Changed
- When you release the dictation shortcut, Echo stops the live preview instead of waiting for it to catch up. With the Medium model, that wait could take up to 8 seconds before the final transcription even started. The final transcription now starts right away.
- The live preview keeps up while you speak: when it falls behind, it transcribes only the latest audio instead of every step it missed.
- Rewriting and voice commands are now separate:
  - Voice commands run only when no text field has focus, such as on the desktop, in Finder or in File Explorer. Anything you say there that isn't a command is offered as text.
  - A dictation into a text field never runs a command; it is rewritten first if Rewrite before pasting is on.
  - Chat dictations go straight to chat without a rewrite.
  - Voice commands no longer need post-processing turned on. If post-processing was off, the update turns voice commands off too, so commands never start running without you choosing them.
  - Echo only calls Qwen3 4B when one of these applies.
- On Windows, Echo asks UI Automation what has focus, so it can tell a text field from the desktop, a file list or a button.
- Text to speech now reads out what a voice command did, such as "Opened Safari", instead of your dictated text. Its switch, Speak replies, is under Post-processing → Voice commands.

### Removed
- The Text to speech page and its voice preview.
- Voice commands on Linux, where Echo can't tell whether a text field has focus.

### Fixed
- Reprocessing a history entry could run a voice command, such as opening an app, instead of rewriting the text.
- Rewrites, voice commands and chat answers from Qwen3 4B had no length limit, so one that kept repeating itself could run past the 30-second limit and leave you with the raw text. Every answer now stops at 2,048 tokens, as Polish already did.

## [0.8.15] - 2026-10-25

### Added
- On Macs with 24 GB of memory or more, the guest side of a meeting (system audio) gets its own live Voxtral Realtime stream, like your microphone. Below 24 GB the guest keeps the Whisper live preview.

### Changed
- The Clean up setting now says what it does: "Replace misheard words with the spellings in your dictionary." Phrases Whisper invents over silence, like "Thanks for watching", are removed whether it is on or off.
- Echo writes its log to `echo.log` in its logs folder. An older `handy.log` there is no longer written to and can be deleted.
- Stopping a meeting transcribes like Retranscribe: a track without complete live Voxtral text is transcribed with Voxtral instead of Whisper. A track Voxtral already transcribed live is not transcribed again.

### Removed
- The Pop sound theme. Its sounds never shipped, so choosing it played nothing. Settings that used it switch to Marimba.

### Fixed
- Live meeting text now appears for quiet speakers. The live preview judged speech by loudness, so a guest whose audio came in quietly got no live text until Stop; it now uses Silero speech detection, as dictation does.
- A recording, in a meeting or in dictation, could stay empty when the microphone had briefly stopped sending audio at the moment recording started.
- A meeting cut short by a crash, a forced quit or a relaunch (such as macOS restarting Echo after you grant Screen Recording) keeps its recorded audio on both tracks, minus at most the last quarter second. Before, a meeting cut short in its first 10 seconds came back with no audio, and later ones lost up to their last 10 seconds.
- A dictionary spelling containing `$`, such as `$ECHO`, is now inserted as written.

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

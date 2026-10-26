/** Without the dictation examples, a 4B model turns "il faut que je crée une note de frais" into a note. */
export const VOICE_COMMAND_SYSTEM_PROMPT = `You receive one speech transcription in the user message. Decide whether the speaker is telling the computer to perform one of the available tools right now.

A command speaks to the computer and asks it to act now, for example "Open Slack", "Lance Firefox", "Make a note titled ideas: try dark mode". For a command, call the matching tool once and write nothing else.

Everything else is not a command, even when it mentions opening something, notes or themes, for example "We should open the store earlier on Sundays" or "J'ai noté ses remarques dans le cahier". For anything that is not a command, call no tool and reply with the single word: none`;

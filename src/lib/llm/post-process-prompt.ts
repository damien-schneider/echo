import { replaceMentionOutputInMarkdown } from "@/lib/utils/replace-mention-output";

const TRANSCRIPT_IN_USER_MESSAGE = "(the user message)";

/** Without the dictation examples, a 4B model turns "il faut que je crée une note de frais" into a note. */
export function voiceCommandSystemPrompt(textInstructions: string): string {
  return `You receive one speech transcription in the user message. Decide whether the speaker is telling the computer to perform one of the available tools right now, or dictating text.

A command speaks to the computer and asks it to act now, for example "Open Slack", "Lance Firefox", "Make a note titled ideas: try dark mode". For a command, call the matching tool once and write nothing else.

Everything else is dictation, even when it mentions opening something, notes or themes, for example "We should open the store earlier on Sundays" or "J'ai noté ses remarques dans le cahier". For dictation, call no tool: apply the text instructions below to the transcription and reply with the resulting text only.

Text instructions:
${replaceMentionOutputInMarkdown(textInstructions, TRANSCRIPT_IN_USER_MESSAGE)}`;
}

import { invoke } from "@tauri-apps/api/core";
import { PolishStatusSchema } from "@/lib/types";

// A summary that cannot run until Echo 4B is downloaded from Models.
export class MeetingSummaryError extends Error {}

const SYSTEM_PROMPT = `You summarize meeting transcripts.
Write in the language the transcript is in — never translate it.
Use only what the transcript says: no invented names, decisions, dates or owners.
Answer in Markdown using these headings, and drop any heading you have nothing for:

## TL;DR
## Decisions
## Action items
## Open questions

Under "Action items", start each line with the owner named in the transcript, or "Unassigned".`;

const summaryPrompt = (transcript: string) =>
  `Summarize this meeting transcript.\n\n${transcript}`;

const chapterPrompt = (transcript: string) =>
  `This is one part of a longer meeting. List what it contains — topics, decisions, action items with owners, open questions — as compact Markdown bullets. No preamble.\n\n${transcript}`;

const mergePrompt = (parts: string) =>
  `These are notes taken from consecutive parts of one meeting, in order. Merge them into a single summary, dropping repetition and keeping every decision and action item.\n\n${parts}`;

interface SummaryEngine {
  charBudget: number;
  run: (prompt: string) => Promise<string>;
}

/**
 * Splits on segment boundaries so no utterance is cut in half. A single segment longer than the
 * budget is kept whole — losing a sentence is worse than one oversized call.
 */
export function splitTranscript(
  transcript: string,
  charBudget: number
): string[] {
  const lines = transcript.split("\n").filter((line) => line.trim() !== "");
  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
    if (current === "") {
      current = line;
      continue;
    }
    if (current.length + 1 + line.length > charBudget) {
      chunks.push(current);
      current = line;
      continue;
    }
    current = `${current}\n${line}`;
  }
  if (current !== "") {
    chunks.push(current);
  }
  return chunks;
}

async function localEngine(): Promise<SummaryEngine> {
  const polish = PolishStatusSchema.safeParse(
    await invoke("get_polish_status")
  );
  if (polish.success && polish.data.state === "not_downloaded") {
    throw new MeetingSummaryError(
      "Summaries run on Echo 4B, which is not downloaded yet."
    );
  }
  const charBudget = await invoke<number>("local_summary_char_budget");
  return {
    charBudget,
    run: (prompt) =>
      invoke<string>("summarize_text_local", { prompt, system: SYSTEM_PROMPT }),
  };
}

async function summarizeChapters(
  chapters: string[],
  engine: SummaryEngine
): Promise<string> {
  const notes: string[] = [];
  // Sequential: the local sidecar serves one request at a time.
  for (const chapter of chapters) {
    notes.push(await engine.run(chapterPrompt(chapter)));
  }
  return reduceNotes(notes, engine);
}

async function reduceNotes(
  notes: string[],
  engine: SummaryEngine
): Promise<string> {
  let parts = notes;
  while (parts.length > 1) {
    const groups = splitTranscript(parts.join("\n\n"), engine.charBudget);
    const [first] = groups;
    if (groups.length >= parts.length && first !== undefined) {
      // ponytail: notes that refuse to shrink summarize their first group; recurse if it ever bites
      return engine.run(mergePrompt(first));
    }
    const merged: string[] = [];
    for (const group of groups) {
      merged.push(await engine.run(mergePrompt(group)));
    }
    parts = merged;
  }
  return parts[0] ?? "";
}

export async function generateMeetingSummary(
  transcript: string
): Promise<string> {
  const engine = await localEngine();

  const [first, ...rest] = splitTranscript(transcript, engine.charBudget);
  if (first === undefined) {
    throw new Error("This meeting has no transcript to summarize yet.");
  }
  if (rest.length === 0) {
    return engine.run(summaryPrompt(first));
  }
  return summarizeChapters([first, ...rest], engine);
}

import { invoke } from "@tauri-apps/api/core";
import { generateText } from "ai";
import { PolishStatusSchema, type Settings } from "@/lib/types";
import { createLlmModel } from "./providers";

export type SummarySetupSection = "models" | "post-processing";

export const SUMMARY_SETUP_LABELS: Record<SummarySetupSection, string> = {
  models: "Open Models",
  "post-processing": "Open AI settings",
};

// A summary that cannot run yet, carrying the settings section that fixes it.
export class MeetingSummaryError extends Error {
  readonly section: SummarySetupSection;

  constructor(message: string, section: SummarySetupSection) {
    super(message);
    this.section = section;
  }
}

// Cloud context windows are far larger; this is what keeps one call cheap and fast.
const CLOUD_CHAR_BUDGET = 24_000;

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
      "Summaries run on the on-device model, which is not downloaded yet.",
      "models"
    );
  }
  const charBudget = await invoke<number>("local_summary_char_budget");
  return {
    charBudget,
    run: (prompt) =>
      invoke<string>("summarize_text_local", { prompt, system: SYSTEM_PROMPT }),
  };
}

function cloudEngine(settings: Settings): SummaryEngine {
  const provider = settings.post_process_providers.find(
    (p) => p.id === settings.post_process_provider_id
  );
  if (!provider) {
    throw new MeetingSummaryError(
      "Cloud summaries need an AI provider, or switch the meeting summary back to on-device.",
      "post-processing"
    );
  }

  const modelId = settings.post_process_models[provider.id] ?? "";
  if (!modelId.trim()) {
    throw new MeetingSummaryError(
      `Cloud summaries need a ${provider.label} model, or switch the meeting summary back to on-device.`,
      "post-processing"
    );
  }

  const model = createLlmModel(
    provider,
    settings.post_process_api_keys[provider.id] ?? "",
    modelId
  );

  return {
    charBudget: CLOUD_CHAR_BUDGET,
    run: async (prompt) => {
      const result = await generateText({
        messages: [{ content: prompt, role: "user" }],
        model,
        system: SYSTEM_PROMPT,
      });
      return result.text;
    },
  };
}

async function summarizeChapters(
  chapters: string[],
  engine: SummaryEngine
): Promise<string> {
  const notes: string[] = [];
  // Sequential: the local sidecar serves one request at a time, and cloud providers rate-limit.
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
  transcript: string,
  settings: Settings
): Promise<string> {
  const engine =
    settings.meeting_summary_engine === "cloud"
      ? cloudEngine(settings)
      : await localEngine();

  const [first, ...rest] = splitTranscript(transcript, engine.charBudget);
  if (first === undefined) {
    throw new Error("This meeting has no transcript to summarize yet.");
  }
  if (rest.length === 0) {
    return engine.run(summaryPrompt(first));
  }
  return summarizeChapters([first, ...rest], engine);
}

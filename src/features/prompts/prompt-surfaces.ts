import type { PromptEntry } from "@/features/prompts/prompt-library-store";

export const PROMPT_SURFACES = {
  dictation: {
    description: "Rewrites what you say before it is pasted.",
    emptyLabel: "Off",
    setting: "dictation_prompt",
    title: "Dictation",
  },
  polish: {
    description: "Replaces the text you select.",
    emptyLabel: null,
    setting: "polish_prompt",
    title: "Polish",
  },
  chat: {
    description: "Answers in the island.",
    emptyLabel: "Free chat",
    setting: "chat_prompt",
    title: "Chat",
  },
} as const;

export type PromptSurface = keyof typeof PROMPT_SURFACES;

const NO_PROMPT = "none";

export const surfaceChoices = (
  surface: PromptSurface,
  entries: PromptEntry[]
) => {
  const { emptyLabel } = PROMPT_SURFACES[surface];
  const prompts = entries.map((entry) => ({
    label: entry.name,
    value: entry.id,
  }));
  return emptyLabel === null
    ? prompts
    : [{ label: emptyLabel, value: NO_PROMPT }, ...prompts];
};

export const choiceFromPromptRef = (prompt: string | null | undefined) =>
  prompt ?? NO_PROMPT;

export const promptRefFromChoice = (choice: string) =>
  choice === NO_PROMPT ? null : choice;

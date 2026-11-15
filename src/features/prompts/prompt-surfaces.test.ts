import { describe, expect, it } from "bun:test";
import type { PromptEntry } from "@/features/prompts/prompt-library-store";
import {
  promptRefFromChoice,
  surfaceChoices,
} from "@/features/prompts/prompt-surfaces";

const library: PromptEntry[] = [
  { id: "natural", instruction: "Fix it.", locked: true, name: "Natural" },
  {
    id: "translate",
    instruction: "Translate it.",
    locked: false,
    name: "Translate",
  },
];

describe("choosing the prompt a surface uses", () => {
  it("offers Off for dictation so the raw transcript can be pasted", () => {
    expect(surfaceChoices("dictation", library)).toEqual([
      { label: "Off", value: "none" },
      { label: "Natural", value: "natural" },
      { label: "Translate", value: "translate" },
    ]);
  });

  it("always runs a prompt for Polish", () => {
    expect(surfaceChoices("polish", library).map((c) => c.label)).toEqual([
      "Natural",
      "Translate",
    ]);
  });

  it("offers Free chat so the island can stay a plain conversation", () => {
    expect(surfaceChoices("chat", library)[0]).toEqual({
      label: "Free chat",
      value: "none",
    });
  });

  it("stores the empty choice as no prompt", () => {
    expect(promptRefFromChoice("none")).toBeNull();
    expect(promptRefFromChoice("translate")).toBe("translate");
  });
});

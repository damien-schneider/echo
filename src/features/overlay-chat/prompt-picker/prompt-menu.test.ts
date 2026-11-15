import { describe, expect, test } from "bun:test";
import {
  matchingChoices,
  movedHighlight,
  slashQuery,
} from "@/features/overlay-chat/prompt-picker/prompt-menu";

const choices = [
  { label: "Free chat", value: "none" },
  { label: "Natural", value: "natural" },
  { label: "Translate", value: "translate" },
];

describe("typing / in the composer", () => {
  test("a leading slash opens the list with what follows as the filter", () => {
    expect(slashQuery("/")).toBe("");
    expect(slashQuery("/tra")).toBe("tra");
  });

  test("a slash anywhere else is just text", () => {
    expect(slashQuery("and/or")).toBeNull();
    expect(slashQuery("")).toBeNull();
  });

  test("a space ends the command, so a path like /usr stays a question", () => {
    expect(slashQuery("/usr/bin is missing")).toBeNull();
  });
});

describe("filtering prompts", () => {
  test("matches any part of the name, ignoring case", () => {
    expect(matchingChoices(choices, "LAT").map((c) => c.value)).toEqual([
      "translate",
    ]);
  });

  test("an empty filter lists every prompt", () => {
    expect(matchingChoices(choices, "")).toEqual(choices);
  });
});

describe("arrow keys", () => {
  test("wrap around both ends of the list", () => {
    expect(movedHighlight(2, 1, 3)).toBe(0);
    expect(movedHighlight(0, -1, 3)).toBe(2);
  });

  test("stay put when nothing matches", () => {
    expect(movedHighlight(0, 1, 0)).toBe(0);
  });
});

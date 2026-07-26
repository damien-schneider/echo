import { describe, expect, it } from "bun:test";
import {
  parseShortcutFailure,
  shortcutFailureMessage,
} from "@/features/shortcuts/shortcut-failures";

const failure = {
  binding: "option+space",
  bindingId: "transcribe",
  reason: "HotKey already registered",
};

describe("shortcut failure parsing", () => {
  it("accepts what the backend publishes", () => {
    expect(parseShortcutFailure(failure)).toEqual(failure);
  });

  it("rejects a payload it cannot trust", () => {
    expect(parseShortcutFailure({ bindingId: "transcribe" })).toBeNull();
    expect(parseShortcutFailure(null)).toBeNull();
  });
});

describe("shortcut failure message", () => {
  it("names the combination and points at the other owner", () => {
    const message = shortcutFailureMessage(failure);

    expect(message).toContain("option+space");
    expect(message).toContain("another app");
  });

  it("keeps the backend reason out of the sentence when it is empty", () => {
    const message = shortcutFailureMessage({ ...failure, reason: "" });

    expect(message.endsWith(".")).toBe(true);
  });
});

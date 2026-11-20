import { describe, expect, it } from "bun:test";
import {
  parseShortcutFailure,
  shortcutFailureMessage,
  shortcutFailureRecovery,
} from "@/features/shortcuts/shortcut-failures";

const failure = {
  binding: "option+space",
  bindingId: "transcribe",
  reason: "Fn shortcuts need Accessibility access.",
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

describe("shortcut failure toast", () => {
  it("names the combination that does nothing", () => {
    expect(shortcutFailureMessage(failure)).toContain("option+space");
  });

  it("falls back to picking another combination when no reason came", () => {
    expect(shortcutFailureRecovery({ ...failure, reason: "" })).toContain(
      "another combination"
    );
  });
});

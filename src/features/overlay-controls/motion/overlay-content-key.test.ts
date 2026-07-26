import { describe, expect, test } from "bun:test";
import { overlayContentKey } from "@/features/overlay-controls/recording-overlay-state";

describe("overlay content motion key", () => {
  test("animates the handle and action toolbar as distinct content", () => {
    expect(
      overlayContentKey({
        mode: "compact",
        overlayState: "recording",
        polishState: "ready",
      })
    ).toBe("compact");
    expect(
      overlayContentKey({
        mode: "actions",
        overlayState: "recording",
        polishState: "ready",
      })
    ).toBe("actions");
  });

  test("animates processing and result text without keying streaming words", () => {
    expect(
      overlayContentKey({
        mode: "recording",
        overlayState: "processing",
        polishState: "ready",
      })
    ).toBe("activity:processing");
    expect(
      overlayContentKey({
        mode: "recording",
        overlayState: "tool",
        polishState: "ready",
      })
    ).toBe("activity:tool");
  });

  test("animates every Polish preparation phase inside the same panel", () => {
    expect(
      overlayContentKey({
        mode: "panel",
        overlayState: "recording",
        polishState: "verifying",
      })
    ).toBe("panel:verifying");
    expect(
      overlayContentKey({
        mode: "panel",
        overlayState: "recording",
        polishState: "loading",
      })
    ).toBe("panel:loading");
  });
});

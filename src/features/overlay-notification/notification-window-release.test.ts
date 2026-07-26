import { describe, expect, test } from "bun:test";
import {
  NOTIFICATION_RELEASE_DELAY_MS,
  notificationWindowIsEmpty,
} from "@/features/overlay-notification/notification-window-release";

describe("Notification window release", () => {
  test("a surface with something to draw keeps the window", () => {
    expect(
      notificationWindowIsEmpty({
        hasSurface: true,
        isPreparing: false,
        mode: "panel",
      })
    ).toBe(false);
  });

  /// Rust shows the window before the geometry reaches the webview: releasing
  /// mid-transition would close the surface that is opening.
  test("a window still opening is left alone", () => {
    expect(
      notificationWindowIsEmpty({
        hasSurface: false,
        isPreparing: true,
        mode: "panel",
      })
    ).toBe(false);
  });

  test("a staged surface that never arrived is released", () => {
    expect(
      notificationWindowIsEmpty({
        hasSurface: false,
        isPreparing: false,
        mode: "panel",
      })
    ).toBe(true);
  });

  test("a dismissed surface is released even when no exit animation ran", () => {
    expect(
      notificationWindowIsEmpty({
        hasSurface: true,
        isPreparing: false,
        mode: null,
      })
    ).toBe(true);
  });

  test("the backstop waits longer than the morph it protects", () => {
    expect(NOTIFICATION_RELEASE_DELAY_MS).toBeGreaterThanOrEqual(900);
  });
});

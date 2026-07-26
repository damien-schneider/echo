import { describe, expect, it } from "bun:test";
import { updateNoticeFor } from "@/features/overlay-notification/update-notice";
import {
  idleUpdateSnapshot,
  type UpdateSnapshot,
} from "@/features/updates/update-status";

const snapshot = (overrides: Partial<UpdateSnapshot>): UpdateSnapshot => ({
  ...idleUpdateSnapshot,
  ...overrides,
});

const noticeFor = (
  overrides: Partial<UpdateSnapshot>,
  dismissedVersion: string | null = null
) => updateNoticeFor({ dismissedVersion, snapshot: snapshot(overrides) });

describe("notch update notice", () => {
  it("stays out of the notch while nothing is on offer", () => {
    expect(
      updateNoticeFor({ dismissedVersion: null, snapshot: idleUpdateSnapshot })
    ).toBeNull();
    expect(noticeFor({ phase: "checking" })).toBeNull();
  });

  it("offers the new version with a button that installs it", () => {
    const notice = noticeFor({ phase: "available", version: "0.5.0" });

    expect(notice).toEqual({
      actionLabel: "Update",
      decoration: "none",
      isDismissible: true,
      text: "Update available — v0.5.0",
      visualState: "steady",
    });
  });

  it("keeps quiet about a version the user already waved away", () => {
    expect(
      noticeFor({ phase: "available", version: "0.5.0" }, "0.5.0")
    ).toBeNull();
    expect(
      noticeFor({ phase: "available", version: "0.6.0" }, "0.5.0")
    ).not.toBeNull();
  });

  it("follows the download the user started, wherever they started it", () => {
    const downloading = noticeFor({
      phase: "downloading",
      progress: 42,
      version: "0.5.0",
    });

    expect(downloading?.text).toBe("Downloading update… 42%");
    expect(downloading?.decoration).toBe("progress");
    expect(downloading?.visualState).toBe("processing");
    expect(downloading?.actionLabel).toBeNull();
    expect(downloading?.isDismissible).toBe(false);
  });

  it("never hides work in flight behind an earlier dismissal", () => {
    expect(
      noticeFor({ phase: "installing", version: "0.5.0" }, "0.5.0")
    ).not.toBeNull();
  });

  it("shows a failed install as a retry", () => {
    const failed = noticeFor({
      error: "Echo could not reach the update server.",
      phase: "error",
      version: "0.5.0",
    });

    expect(failed?.text).toBe("Echo could not reach the update server.");
    expect(failed?.visualState).toBe("error");
    expect(failed?.actionLabel).toBe("Retry");
    expect(failed?.isDismissible).toBe(true);
  });

  it("leaves an error with nothing to install to the app window", () => {
    expect(noticeFor({ error: "Check failed", phase: "error" })).toBeNull();
  });
});

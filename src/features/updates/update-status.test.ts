import { describe, expect, it } from "bun:test";
import {
  canInstallUpdate,
  idleUpdateSnapshot,
  isUpdateBusy,
  parseUpdateSnapshot,
  updateActionLabel,
  updateBridgeFailure,
  updateStatusText,
} from "@/features/updates/update-status";

const snapshot = (
  overrides: Partial<ReturnType<typeof parseUpdateSnapshot>> = {}
) => ({ ...idleUpdateSnapshot, ...overrides });

describe("update snapshot parsing", () => {
  it("accepts what the backend publishes", () => {
    const parsed = parseUpdateSnapshot({
      error: null,
      phase: "available",
      progress: null,
      version: "0.5.0",
    });

    expect(parsed).toEqual(snapshot({ phase: "available", version: "0.5.0" }));
  });

  it("turns an unreadable payload into a visible failure", () => {
    const parsed = parseUpdateSnapshot({ phase: "teleporting" });

    expect(parsed.phase).toBe("error");
    expect(parsed.error).toBe(updateBridgeFailure().error);
  });

  it("keeps the known version when the bridge itself fails", () => {
    const failure = updateBridgeFailure(
      snapshot({ phase: "available", version: "0.5.0" })
    );

    expect(failure.phase).toBe("error");
    expect(failure.version).toBe("0.5.0");
  });
});

describe("update availability", () => {
  it("blocks a second request while work is running", () => {
    expect(isUpdateBusy("checking")).toBe(true);
    expect(isUpdateBusy("downloading")).toBe(true);
    expect(isUpdateBusy("installing")).toBe(true);
    expect(isUpdateBusy("available")).toBe(false);
    expect(isUpdateBusy("idle")).toBe(false);
  });

  it("offers an install for an available version and for a failed attempt", () => {
    expect(
      canInstallUpdate(snapshot({ phase: "available", version: "0.5.0" }))
    ).toBe(true);
    expect(
      canInstallUpdate(
        snapshot({ error: "Network down", phase: "error", version: "0.5.0" })
      )
    ).toBe(true);
    expect(
      canInstallUpdate(snapshot({ error: "Network down", phase: "error" }))
    ).toBe(false);
    expect(canInstallUpdate(idleUpdateSnapshot)).toBe(false);
  });
});

describe("update copy", () => {
  it("says nothing when there is nothing to report", () => {
    expect(updateStatusText(idleUpdateSnapshot)).toBe("");
    expect(updateActionLabel(idleUpdateSnapshot)).toBeNull();
  });

  it("names the version on offer", () => {
    expect(
      updateStatusText(snapshot({ phase: "available", version: "0.5.0" }))
    ).toBe("Update available — v0.5.0");
    expect(
      updateActionLabel(snapshot({ phase: "available", version: "0.5.0" }))
    ).toBe("Update");
  });

  it("counts the download and then the install", () => {
    expect(
      updateStatusText(
        snapshot({ phase: "downloading", progress: 42, version: "0.5.0" })
      )
    ).toBe("Downloading update… 42%");
    expect(
      updateStatusText(snapshot({ phase: "downloading", version: "0.5.0" }))
    ).toBe("Downloading update…");
    expect(
      updateStatusText(snapshot({ phase: "installing", version: "0.5.0" }))
    ).toBe("Installing update…");
  });

  it("repeats the backend reason and offers a retry", () => {
    const failed = snapshot({
      error: "Echo could not reach the update server.",
      phase: "error",
      version: "0.5.0",
    });

    expect(updateStatusText(failed)).toBe(
      "Echo could not reach the update server."
    );
    expect(updateActionLabel(failed)).toBe("Retry");
  });

  it("falls back to a plain sentence for an error with no reason", () => {
    expect(updateStatusText(snapshot({ phase: "error" }))).toBe(
      "The update failed."
    );
  });
});

describe("a build without an updater", () => {
  it("accepts the phase the backend publishes for dev builds", () => {
    const parsed = parseUpdateSnapshot({
      error: null,
      phase: "unsupported",
      progress: null,
      version: null,
    });

    expect(parsed.phase).toBe("unsupported");
  });

  it("offers nothing to say, run, or install", () => {
    const unsupported = snapshot({ phase: "unsupported" });

    expect(updateStatusText(unsupported)).toBe("");
    expect(updateActionLabel(unsupported)).toBeNull();
    expect(canInstallUpdate(unsupported)).toBe(false);
    expect(isUpdateBusy("unsupported")).toBe(false);
  });
});

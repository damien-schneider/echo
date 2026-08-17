import { describe, expect, it } from "bun:test";
import {
  activityDecorationFor,
  activityEdgeFor,
  activityVisualStateFor,
  hasHorizontalOverflow,
  hudModeFor,
  isDisplayableProgress,
  islandActionStateFor,
  modelDownloadLabel,
  modelStateLabel,
  notificationModeFor,
  overlayActivityText,
  overlayDisplayText,
  overlayEscapeIntent,
  polishControlIntent,
} from "@/features/overlay-controls/recording-overlay-state";
import type { PolishStatus } from "@/lib/types";

describe("hudModeFor", () => {
  it("rests as a handle and widens only for its action row", () => {
    expect(hudModeFor(false)).toBe("compact");
    expect(hudModeFor(true)).toBe("actions");
  });
});

describe("notificationModeFor", () => {
  it("says nothing while there is nothing to say", () => {
    expect(notificationModeFor({ isShown: false, request: null })).toBeNull();
  });

  it("opens the surface the HUD asked for", () => {
    expect(notificationModeFor({ isShown: false, request: "chat" })).toBe(
      "chat"
    );
    expect(notificationModeFor({ isShown: false, request: "panel" })).toBe(
      "panel"
    );
  });

  it("never lets a requested surface hide shortcut-started recording", () => {
    expect(notificationModeFor({ isShown: true, request: "chat" })).toBe(
      "recording"
    );
  });
});

describe("island presentation states", () => {
  it("keeps recording stoppable while other active work is busy", () => {
    expect(
      islandActionStateFor({ hasActiveOperation: true, isRecording: true })
    ).toBe("recording");
    expect(
      islandActionStateFor({ hasActiveOperation: true, isRecording: false })
    ).toBe("busy");
    expect(
      islandActionStateFor({ hasActiveOperation: false, isRecording: false })
    ).toBe("idle");
  });

  it("gives errors precedence over processing animation", () => {
    expect(activityVisualStateFor({ hasError: true, isProcessing: true })).toBe(
      "error"
    );
    expect(
      activityVisualStateFor({ hasError: false, isProcessing: true })
    ).toBe("processing");
  });

  it("gives Polish its own orbit without reusing audio activity", () => {
    expect(
      activityDecorationFor({
        hasError: false,
        isPolishing: true,
        isRecording: false,
        isTranscribing: false,
        showsDownload: false,
      })
    ).toBe("orbit");
    expect(
      activityDecorationFor({
        hasError: false,
        isPolishing: false,
        isRecording: true,
        isTranscribing: false,
        showsDownload: false,
      })
    ).toBe("microphone");
    expect(
      activityDecorationFor({
        hasError: false,
        isPolishing: false,
        isRecording: false,
        isTranscribing: true,
        showsDownload: false,
      })
    ).toBe("progress");
  });

  it("rings work in flight, breathes while listening, leaves a settled edge bare", () => {
    expect(activityEdgeFor("orbit")).toBe("trace");
    expect(activityEdgeFor("progress")).toBe("trace");
    expect(activityEdgeFor("microphone")).toBe("ambience");
    expect(activityEdgeFor("none")).toBeNull();
  });
});

describe("activity text overflow", () => {
  it("does not mask text that fits its viewport", () => {
    expect(hasHorizontalOverflow({ clientWidth: 240, scrollWidth: 240 })).toBe(
      false
    );
    expect(hasHorizontalOverflow({ clientWidth: 240, scrollWidth: 120 })).toBe(
      false
    );
  });

  it("masks text only when content extends beyond its viewport", () => {
    expect(hasHorizontalOverflow({ clientWidth: 240, scrollWidth: 241 })).toBe(
      true
    );
  });
});

describe("overlayEscapeIntent", () => {
  it("registers global cancellation only for an active operation", () => {
    expect(
      overlayEscapeIntent({ hasActiveOperation: true, mode: "recording" })
    ).toBe("cancel_operation");
  });

  it("dismisses focused chat and model panels locally", () => {
    expect(
      overlayEscapeIntent({ hasActiveOperation: false, mode: "chat" })
    ).toBe("dismiss_surface");
    expect(
      overlayEscapeIntent({ hasActiveOperation: false, mode: "panel" })
    ).toBe("dismiss_surface");
  });

  it("does not capture Escape while the resident control is idle", () => {
    expect(
      overlayEscapeIntent({ hasActiveOperation: false, mode: "compact" })
    ).toBe("none");
    expect(
      overlayEscapeIntent({ hasActiveOperation: false, mode: "actions" })
    ).toBe("none");
  });

  it("does not globally capture Escape for a non-operation error surface", () => {
    expect(
      overlayEscapeIntent({ hasActiveOperation: false, mode: "recording" })
    ).toBe("none");
  });
});

describe("polishControlIntent", () => {
  const status = (state: PolishStatus["state"]): PolishStatus => ({
    message: state,
    state,
  });

  it("runs immediately only when the local model is ready", () => {
    expect(polishControlIntent(status("ready"))).toBe("run");
  });

  it("opens model UI for missing, loading, downloading, and repair states", () => {
    for (const state of [
      "not_downloaded",
      "preparing",
      "downloading",
      "verifying",
      "loading",
      "repair",
    ] satisfies PolishStatus["state"][]) {
      expect(polishControlIntent(status(state))).toBe("open_panel");
    }
  });
});

describe("modelDownloadLabel", () => {
  it("names Polish while its fixed local model downloads", () => {
    expect(modelDownloadLabel("polish-qwen3-4b-instruct-2507", 42.4)).toBe(
      "Downloading Polish… 42%"
    );
  });

  it("uses English for transcription downloads", () => {
    expect(modelDownloadLabel("medium", 42.4)).toBe(
      "Downloading transcription model… 42%"
    );
  });
});

describe("modelStateLabel", () => {
  it("returns null when model is Ready (no badge)", () => {
    expect(modelStateLabel("Ready")).toBeNull();
  });

  it("returns null when Unloaded (no badge until user acts)", () => {
    expect(modelStateLabel("Unloaded")).toBeNull();
  });

  it("returns an English preparing label while Loading", () => {
    expect(modelStateLabel("Loading")).toBe("Preparing local model…");
  });

  it("returns an English error label on Error", () => {
    expect(modelStateLabel("Error")).toBe("Local model error");
  });
});

describe("overlayDisplayText", () => {
  it("shows streaming transcription even while the model badge is set", () => {
    expect(
      overlayDisplayText({
        modelBadge: "Preparing local model…",
        state: "recording",
        streamingText: "bonjour le monde",
        warningMessage: "",
      })
    ).toBe("bonjour le monde");
  });

  it("shows the model badge when there is no streaming text or warning", () => {
    expect(
      overlayDisplayText({
        modelBadge: "Preparing local model…",
        state: "recording",
        streamingText: "",
        warningMessage: "",
      })
    ).toBe("Preparing local model…");
  });

  it("prioritises the warning message in warning state", () => {
    expect(
      overlayDisplayText({
        modelBadge: "Local model error",
        state: "warning",
        streamingText: "",
        warningMessage: "File transcription in progress",
      })
    ).toBe("File transcription in progress");
  });

  it("prioritises the warning message in tool state", () => {
    expect(
      overlayDisplayText({
        modelBadge: null,
        state: "tool",
        streamingText: "ignored",
        warningMessage: "Running tool…",
      })
    ).toBe("Running tool…");
  });

  it("uses Rust processing copy for the dedicated Polish state", () => {
    expect(
      overlayDisplayText({
        modelBadge: null,
        state: "processing",
        streamingText: "",
        warningMessage: "Polishing…",
      })
    ).toBe("Polishing…");
  });

  it("returns empty string when nothing is to be shown", () => {
    expect(
      overlayDisplayText({
        modelBadge: null,
        state: "recording",
        streamingText: "",
        warningMessage: "",
      })
    ).toBe("");
  });
});

describe("overlayActivityText", () => {
  const base = {
    activityError: null,
    download: { model_id: "medium", percentage: 41 },
    isVisible: true,
    modelBadge: null,
    state: "recording" as const,
    streamingText: "live words",
    warningMessage: "",
  };

  it("keeps live transcription above unrelated downloads", () => {
    expect(overlayActivityText(base)).toBe("live words");
  });

  it("shows stable background download copy only while idle", () => {
    expect(
      overlayActivityText({
        ...base,
        isVisible: false,
        streamingText: "",
      })
    ).toBe("Downloading transcription model… 41%");
  });

  it("makes actionable island errors visible", () => {
    expect(
      overlayActivityText({
        ...base,
        activityError: "Couldn’t start recording. Try again.",
      })
    ).toBe("Couldn’t start recording. Try again.");
  });

  it("keeps quiet recording visually calm instead of saying Listening", () => {
    expect(
      overlayActivityText({
        ...base,
        download: null,
        streamingText: "",
      })
    ).toBe("");
  });
});

describe("isDisplayableProgress", () => {
  it("accepts text with visible characters", () => {
    expect(isDisplayableProgress("hello")).toBe(true);
    expect(isDisplayableProgress("  x  ")).toBe(true);
  });

  it("rejects empty and whitespace-only payloads", () => {
    expect(isDisplayableProgress("")).toBe(false);
    expect(isDisplayableProgress("   \t\n  ")).toBe(false);
  });
});

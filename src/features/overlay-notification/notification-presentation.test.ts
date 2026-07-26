import { describe, expect, it } from "bun:test";
import type { OverlayState } from "@/features/overlay-controls/recording-overlay-state";
import type { useOverlayEvents } from "@/features/overlay-controls/use-overlay-events";
import { createNotificationPresentation } from "@/features/overlay-notification/notification-presentation";
import type { UpdateNotice } from "@/features/overlay-notification/update-notice";

type OverlayEvents = ReturnType<typeof useOverlayEvents>;

const events = (overrides: Partial<OverlayEvents> = {}): OverlayEvents => ({
  dismissPassiveActivity: () => undefined,
  download: null,
  eventError: null,
  isSurfaceReady: true,
  isVisible: false,
  state: "recording" as OverlayState,
  streamingText: "",
  surface: null,
  warningMessage: "",
  ...overrides,
});

const updateNotice = (overrides: Partial<UpdateNotice> = {}): UpdateNotice => ({
  actionLabel: "Update",
  decoration: "none",
  isDismissible: true,
  text: "Update available — v0.5.0",
  visualState: "steady",
  ...overrides,
});

describe("notification presentation", () => {
  it("stays silent until something asks for the surface", () => {
    const quiet = createNotificationPresentation({
      events: events(),
      modelState: "Ready",
      request: null,
      updateNotice: null,
    });

    expect(quiet.mode).toBeNull();
    expect(quiet.escapeIntent).toBe("none");
    expect(quiet.hasActiveOperation).toBe(false);
    expect(quiet.activityAction).toBeNull();
  });

  it("opens what the HUD asked for and lets Escape close it", () => {
    const chat = createNotificationPresentation({
      events: events(),
      modelState: "Ready",
      request: "chat",
      updateNotice: null,
    });

    expect(chat.mode).toBe("chat");
    expect(chat.escapeIntent).toBe("dismiss_surface");
  });

  it("gives an active operation the surface and offers to cancel it", () => {
    const recording = createNotificationPresentation({
      events: events({ isVisible: true, state: "recording" }),
      modelState: "Ready",
      request: "chat",
      updateNotice: null,
    });

    expect(recording.mode).toBe("recording");
    expect(recording.escapeIntent).toBe("cancel_operation");
    expect(recording.activityDismissal?.intent).toBe("cancel_operation");
    expect(recording.activityDecoration).toBe("microphone");
    expect(recording.activityAction).toEqual({
      intent: "finish_recording",
      label: "Transcribe",
      title: "Finish recording and transcribe",
    });
  });

  it("shows a background download only when nothing was requested", () => {
    const download = {
      model_id: "polish-qwen3-4b-instruct-2507",
      percentage: 10,
    };
    const alone = createNotificationPresentation({
      events: events({ download }),
      modelState: "Ready",
      request: null,
      updateNotice: null,
    });
    const behindChat = createNotificationPresentation({
      events: events({ download }),
      modelState: "Ready",
      request: "chat",
      updateNotice: null,
    });

    expect(alone.mode).toBe("recording");
    expect(alone.activityText).toBe("Downloading Polish… 10%");
    expect(behindChat.mode).toBe("chat");
  });

  it("reports a broken event bridge as a dismissable error", () => {
    const failed = createNotificationPresentation({
      events: events({ eventError: "Echo controls lost their connection." }),
      modelState: "Ready",
      request: null,
      updateNotice: null,
    });

    expect(failed.mode).toBe("recording");
    expect(failed.activityVisualState).toBe("error");
    expect(failed.activityDismissal?.intent).toBe("dismiss_surface");
  });
});

describe("update notices in the notch", () => {
  it("opens the notch with the version and the button that installs it", () => {
    const offered = createNotificationPresentation({
      events: events(),
      modelState: "Ready",
      request: null,
      updateNotice: updateNotice(),
    });

    expect(offered.mode).toBe("recording");
    expect(offered.activityText).toBe("Update available — v0.5.0");
    expect(offered.activityAction).toEqual({
      intent: "install_update",
      label: "Update",
      title: "Install the update and restart Echo",
    });
    expect(offered.activityDismissal).toEqual({
      intent: "dismiss_update",
      label: "Dismiss update notice",
    });
  });

  it("keeps the download uninterruptible while it runs", () => {
    const downloading = createNotificationPresentation({
      events: events(),
      modelState: "Ready",
      request: null,
      updateNotice: updateNotice({
        actionLabel: null,
        decoration: "progress",
        isDismissible: false,
        text: "Downloading update… 42%",
        visualState: "processing",
      }),
    });

    expect(downloading.activityDecoration).toBe("progress");
    expect(downloading.activityVisualState).toBe("processing");
    expect(downloading.activityAction).toBeNull();
    expect(downloading.activityDismissal).toBeNull();
  });

  it("never takes the surface from recording or from what the HUD opened", () => {
    const whileRecording = createNotificationPresentation({
      events: events({ isVisible: true, state: "recording" }),
      modelState: "Ready",
      request: null,
      updateNotice: updateNotice(),
    });
    const behindChat = createNotificationPresentation({
      events: events(),
      modelState: "Ready",
      request: "chat",
      updateNotice: updateNotice(),
    });

    expect(whileRecording.activityText).toBe("");
    expect(whileRecording.activityAction?.intent).toBe("finish_recording");
    expect(behindChat.mode).toBe("chat");
    expect(behindChat.activityAction).toBeNull();
  });

  it("waits behind a model download instead of stacking two messages", () => {
    const behindDownload = createNotificationPresentation({
      events: events({
        download: { model_id: "parakeet-tdt-0.6b-v3", percentage: 30 },
      }),
      modelState: "Ready",
      request: null,
      updateNotice: updateNotice(),
    });

    expect(behindDownload.activityText).toBe(
      "Downloading transcription model… 30%"
    );
    expect(behindDownload.activityAction).toBeNull();
  });
});

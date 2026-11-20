import { describe, expect, it } from "bun:test";
import {
  initialOverlayActivity,
  reduceOverlayActivity,
} from "@/features/overlay-controls/runtime/overlay-activity-state";
import { mockExports } from "@/test/mock-exports";

type EventHandler = (event: { payload: unknown }) => void;

const handlers = new Map<string, EventHandler>();

await mockExports("@tauri-apps/api/event", {
  listen: (event: string, handler: EventHandler) => {
    handlers.set(event, handler);
    return Promise.resolve(() => undefined);
  },
});

// a static import would load the registrations before the Tauri mock exists
const { overlayEventRegistrations } = await import(
  "@/features/overlay-controls/runtime/overlay-event-registrations"
);

const mediumProgress = {
  downloaded: 10,
  model_id: "medium",
  percentage: 5,
  total: 200,
};

const activityAfter = async (deliveries: [string, unknown][]) => {
  let activity = initialOverlayActivity;
  const registrations = overlayEventRegistrations({
    dispatch: (event) => {
      activity = reduceOverlayActivity(activity, event);
    },
    microphoneRef: { current: null },
    onSurface: () => undefined,
    surfaceEvent: "notification-surface",
  });
  await Promise.all(registrations.map((register) => register()));
  for (const [event, payload] of deliveries) {
    handlers.get(event)?.({ payload });
  }
  return activity;
};

describe("overlay download events", () => {
  it("leaves a failure notice on the island when the download it was showing fails", async () => {
    const activity = await activityAfter([
      ["model-download-progress", mediumProgress],
      ["model-download-failed", "medium"],
    ]);

    expect(activity.download).toBeNull();
    expect(activity.isVisible).toBe(true);
    expect(activity.warningMessage).toBe(
      "Model download failed — check your connection and retry"
    );
  });

  it("clears a completed download without a notice", async () => {
    const activity = await activityAfter([
      ["model-download-progress", mediumProgress],
      ["model-download-complete", "medium"],
    ]);

    expect(activity.download).toBeNull();
    expect(activity.isVisible).toBe(false);
    expect(activity.warningMessage).toBe("");
  });
});

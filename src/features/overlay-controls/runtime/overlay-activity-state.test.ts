import { describe, expect, test } from "bun:test";
import {
  initialOverlayActivity,
  type OverlayActivity,
  type OverlayActivityEvent,
  reduceOverlayActivity,
} from "@/features/overlay-controls/runtime/overlay-activity-state";

const apply = (
  events: OverlayActivityEvent[],
  from: OverlayActivity = initialOverlayActivity
) => events.reduce(reduceOverlayActivity, from);

const download = (model_id: string, percentage: number) => ({
  model_id,
  percentage,
});

describe("overlay activity", () => {
  test("a new recording clears the previous transcript", () => {
    const state = apply([
      { message: "", state: "transcribing", type: "shown" },
      { text: "half a sentence", type: "progress" },
      { message: "", state: "recording", type: "shown" },
    ]);

    expect(state.streamingText).toBe("");
    expect(state.isVisible).toBe(true);
    expect(state.state).toBe("recording");
  });

  test("a warning keeps its message and a plain state clears it", () => {
    const warned = apply([
      { message: "Microphone is muted", state: "warning", type: "shown" },
    ]);
    expect(warned.warningMessage).toBe("Microphone is muted");

    expect(
      reduceOverlayActivity(warned, {
        message: "",
        state: "transcribing",
        type: "shown",
      }).warningMessage
    ).toBe("");
  });

  test("progress keeps streaming while transcribing", () => {
    const state = apply([
      { message: "", state: "transcribing", type: "shown" },
      { text: "first", type: "progress" },
      { text: "first second", type: "progress" },
    ]);

    expect(state.streamingText).toBe("first second");
  });

  test("the first download owns the surface until it finishes", () => {
    const state = apply([
      { download: download("whisper", 10), type: "download_progress" },
      { download: download("polish", 50), type: "download_progress" },
      { download: download("whisper", 40), type: "download_progress" },
    ]);

    expect(state.download).toEqual(download("whisper", 40));

    const afterCompletion = apply(
      [
        { modelId: "whisper", type: "download_finished" },
        { download: download("polish", 60), type: "download_progress" },
      ],
      state
    );
    expect(afterCompletion.download).toEqual(download("polish", 60));
  });

  test("a dismissed download stays hidden while it keeps reporting", () => {
    const state = apply([
      { download: download("whisper", 10), type: "download_progress" },
      { type: "dismissed" },
      { download: download("whisper", 20), type: "download_progress" },
    ]);

    expect(state.download).toBeNull();
    expect(state.isVisible).toBe(false);

    const afterOtherModel = reduceOverlayActivity(state, {
      download: download("polish", 5),
      type: "download_progress",
    });
    expect(afterOtherModel.download).toEqual(download("polish", 5));
  });

  test("a dismissed download can be shown again after it restarts", () => {
    const state = apply([
      { download: download("whisper", 10), type: "download_progress" },
      { type: "dismissed" },
      { modelId: "whisper", type: "download_finished" },
      { download: download("whisper", 3), type: "download_progress" },
    ]);

    expect(state.download).toEqual(download("whisper", 3));
  });

  test("dismissing clears the error and the warning but not the transcript", () => {
    const state = apply([
      { message: "Listener crashed", type: "failed" },
      { message: "Microphone is muted", state: "warning", type: "shown" },
      { text: "kept", type: "progress" },
      { type: "dismissed" },
    ]);

    expect(state.error).toBeNull();
    expect(state.warningMessage).toBe("");
    expect(state.isVisible).toBe(false);
    expect(state.streamingText).toBe("kept");
  });

  test("a block keeps the download it offers until that download reports", () => {
    const blocked = apply([
      {
        action: "download_transcription_model",
        message: "Download the Medium model to dictate",
        state: "warning",
        type: "shown",
      },
    ]);

    expect(blocked.remedy).toBe("download_transcription_model");
    expect(blocked.isVisible).toBe(true);

    const downloading = reduceOverlayActivity(blocked, {
      download: download("whisper-medium", 4),
      type: "download_progress",
    });
    expect(downloading.remedy).toBeNull();
    expect(downloading.warningMessage).toBe("");
    expect(downloading.download).toEqual(download("whisper-medium", 4));
  });

  test("a plain warning offers nothing and clears a previous block", () => {
    const state = apply([
      {
        action: "download_transcription_model",
        message: "Download the Medium model to dictate",
        state: "warning",
        type: "shown",
      },
      { message: "Microphone is muted", state: "warning", type: "shown" },
    ]);

    expect(state.remedy).toBeNull();
  });

  test("hiding an already hidden overlay changes nothing", () => {
    expect(
      reduceOverlayActivity(initialOverlayActivity, { type: "hidden" })
    ).toBe(initialOverlayActivity);
  });
});

import { describe, expect, test } from "bun:test";
import {
  clearDownloadFailure,
  modelActionPresentation,
} from "@/features/model-download/download-state";

describe("clearDownloadFailure", () => {
  test("removes stale progress and speed after a failed download", () => {
    const progress = new Map([
      [
        "medium",
        { downloaded: 10, model_id: "medium", percentage: 5, total: 200 },
      ],
    ]);
    const stats = new Map([
      ["medium", { lastUpdate: 1, speed: 9.8, totalDownloaded: 10 }],
    ]);

    const cleared = clearDownloadFailure({
      modelId: "medium",
      progress,
      stats,
    });

    expect(cleared.progress.has("medium")).toBe(false);
    expect(cleared.stats.has("medium")).toBe(false);
  });
});

describe("modelActionPresentation", () => {
  test("keeps Download available when the selected model is not installed", () => {
    expect(
      modelActionPresentation({
        isActive: true,
        isBusy: false,
        isDownloaded: false,
        isDownloading: false,
      })
    ).toEqual({
      disabled: false,
      label: "Download",
      show: true,
      showSpinner: false,
    });
  });

  test("does not show spinners on unrelated disabled model buttons", () => {
    expect(
      modelActionPresentation({
        isActive: false,
        isBusy: true,
        isDownloaded: false,
        isDownloading: false,
      })
    ).toEqual({
      disabled: true,
      label: "Download",
      show: true,
      showSpinner: false,
    });
  });
});

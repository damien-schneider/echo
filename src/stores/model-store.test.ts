import { beforeEach, describe, expect, it, mock } from "bun:test";

type EventHandler = (event: { payload: unknown }) => unknown;

const handlers = new Map<string, EventHandler>();

mock.module("@tauri-apps/api/core", () => ({
  invoke: (command: string) =>
    Promise.resolve(command === "get_transcription_profiles" ? [] : null),
}));

mock.module("@tauri-apps/api/event", () => ({
  listen: (event: string, handler: EventHandler) => {
    handlers.set(event, handler);
    return Promise.resolve(() => undefined);
  },
}));

// a static import would load the store before the Tauri mocks exist
const { useModelStore } = await import("@/stores/model-store");

const deliver = (event: string, payload: unknown) =>
  handlers.get(event)?.({ payload });

const smallProgress = {
  downloaded: 10,
  model_id: "small",
  percentage: 5,
  total: 200,
};

beforeEach(async () => {
  handlers.clear();
  useModelStore.setState({
    downloadProgress: new Map(),
    downloadStats: new Map(),
    error: null,
    loadingSize: null,
    modelStatus: "unloaded",
    profiles: [],
  });
  await useModelStore.getState().setupListeners();
});

describe("model store", () => {
  it("shows a model as loading when Rust sends null for the fields it leaves out", () => {
    deliver("model-state-changed", {
      error: null,
      event_type: "loading_started",
      model_id: "small",
      model_name: null,
    });

    expect(useModelStore.getState().modelStatus).toBe("loading");
    expect(useModelStore.getState().loadingSize).toBe("small");
  });

  it("returns to ready when a load completes with a null error", () => {
    useModelStore.setState({ loadingSize: "small", modelStatus: "loading" });

    deliver("model-state-changed", {
      error: null,
      event_type: "loading_completed",
      model_id: "small",
      model_name: "Small",
    });

    expect(useModelStore.getState().modelStatus).toBe("ready");
    expect(useModelStore.getState().loadingSize).toBeNull();
  });

  it("stops reporting a download as running once it completes", async () => {
    deliver("model-download-progress", smallProgress);
    expect(useModelStore.getState().modelStatus).toBe("downloading");

    await deliver("model-download-complete", "small");

    expect(useModelStore.getState().modelStatus).toBe("unloaded");
    expect(useModelStore.getState().downloadProgress.has("small")).toBe(false);
  });

  it("forgets a download's progress when its completion event was missed", async () => {
    useModelStore.setState({
      downloadProgress: new Map([["small", smallProgress]]),
      downloadStats: new Map([
        ["small", { lastUpdate: 0, speed: 1, totalDownloaded: 10 }],
      ]),
    });

    await useModelStore.getState().selectProfile("small");

    expect(useModelStore.getState().downloadProgress.has("small")).toBe(false);
    expect(useModelStore.getState().downloadStats.has("small")).toBe(false);
    expect(useModelStore.getState().modelStatus).toBe("ready");
  });
});

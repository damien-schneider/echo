import { describe, expect, test } from "bun:test";
import {
  acceptPolishModelStatus,
  createPolishModelSession,
  createPolishStatusSynchronizer,
  handlePolishDownloadComplete,
  handlePolishDownloadProgress,
  handlePolishVerificationProgress,
  initialPolishModelStatus,
  isPolishModelEvent,
  type PolishModelProgress,
  parsePolishDownloadProgress,
  polishModelFailure,
  runPolishModelCommand,
  synchronizePolishModelStatus,
} from "@/features/polish/polish-model-state";
import type { PolishStatus } from "@/lib/types";

describe("Polish model state", () => {
  test("accepts progress only for the fixed Polish model", () => {
    expect(
      parsePolishDownloadProgress({
        downloaded: 1_048_576,
        model_id: "polish-qwen3-4b-instruct-2507",
        percentage: 42,
        total: 2_497_280_448,
      })
    ).toBe(42);
    expect(
      parsePolishDownloadProgress({
        downloaded: 1_048_576,
        model_id: "medium",
        percentage: 42,
        total: 574_041_195,
      })
    ).toBeUndefined();
  });

  test("accepts the complete payload emitted by the Rust downloader", () => {
    expect(
      parsePolishDownloadProgress({
        downloaded: 624_320_112,
        model_id: "polish-qwen3-4b-instruct-2507",
        percentage: 25,
        total: 2_497_280_448,
      })
    ).toBe(25);
  });

  test("rejects malformed and out-of-range progress", () => {
    expect(
      parsePolishDownloadProgress({
        downloaded: 1_048_576,
        model_id: "polish-qwen3-4b-instruct-2507",
        percentage: 101,
        total: 2_497_280_448,
      })
    ).toBeUndefined();
    expect(parsePolishDownloadProgress("42%")).toBeUndefined();
  });

  test("validates model event identifiers at the boundary", () => {
    expect(isPolishModelEvent("polish-qwen3-4b-instruct-2507")).toBe(true);
    expect(
      isPolishModelEvent({ model_id: "polish-qwen3-4b-instruct-2507" })
    ).toBe(false);
  });

  test("uses stable English recovery copy without leaking transport errors", () => {
    expect(polishModelFailure("setup").message).toBe(
      "Polish could not connect to its local model service. Reopen Echo and try again."
    );
    expect(polishModelFailure("download").message).toBe(
      "The Polish model download failed. Check your connection and retry."
    );
  });

  test("starts in a preparing state until authoritative status arrives", () => {
    expect(initialPolishModelStatus).toEqual({
      message: "Checking the local Polish model",
      state: "preparing",
    });
  });

  test("keeps preparing while the initial status request is deferred", async () => {
    const deferred = Promise.withResolvers<unknown>();
    const received: PolishStatus[] = [];
    const synchronization = synchronizePolishModelStatus({
      isStopped: () => false,
      readStatus: () => deferred.promise,
      setStatus: (status) => received.push(status),
    });

    expect(received).toEqual([]);
    deferred.resolve({ message: "Polish ready", state: "ready" });
    await synchronization;

    expect(received).toEqual([{ message: "Polish ready", state: "ready" }]);
  });

  test("refreshes authoritative status after the model download completes", () => {
    let progress: PolishModelProgress | undefined = {
      percentage: 75,
      phase: "download",
    };
    let refreshCount = 0;

    handlePolishDownloadComplete({
      payload: "polish-qwen3-4b-instruct-2507",
      refreshStatus: () => {
        refreshCount += 1;
      },
      setProgress: (nextProgress) => {
        progress = nextProgress;
      },
    });

    expect(progress).toBeUndefined();
    expect(refreshCount).toBe(1);
  });

  test("returns to downloading when verification falls back to real bytes", () => {
    const progress: PolishModelProgress[] = [];
    const received: PolishStatus[] = [];

    handlePolishDownloadProgress({
      payload: {
        downloaded: 924_000_000,
        model_id: "polish-qwen3-4b-instruct-2507",
        percentage: 37,
        total: 2_497_280_448,
      },
      setProgress: (percentage) => progress.push(percentage),
      statusSynchronizer: {
        accept: (status) => received.push(status),
        currentState: () => "downloading",
      },
    });

    expect(received).toEqual([
      { message: "Downloading Polish model", state: "downloading" },
    ]);
    expect(progress).toEqual([{ percentage: 37, phase: "download" }]);
  });

  test("uses real checksum progress while verifying", () => {
    const progress: PolishModelProgress[] = [];
    const received: PolishStatus[] = [];

    handlePolishVerificationProgress({
      payload: {
        downloaded: 1_173_721_811,
        model_id: "polish-qwen3-4b-instruct-2507",
        percentage: 47,
        total: 2_497_280_448,
      },
      setProgress: (nextProgress) => progress.push(nextProgress),
      statusSynchronizer: {
        accept: (status) => received.push(status),
        currentState: () => "verifying",
      },
    });

    expect(received).toEqual([
      { message: "Verifying Polish model", state: "verifying" },
    ]);
    expect(progress).toEqual([{ percentage: 47, phase: "verification" }]);
  });

  test("ignores progress from unrelated or malformed downloads", () => {
    const progress: PolishModelProgress[] = [];
    const received: PolishStatus[] = [];
    const ports = {
      setProgress: (nextProgress: PolishModelProgress) =>
        progress.push(nextProgress),
      statusSynchronizer: {
        accept: (status: PolishStatus) => received.push(status),
        currentState: () => "downloading" as const,
      },
    };

    handlePolishDownloadProgress({
      ...ports,
      payload: {
        downloaded: 42,
        model_id: "medium",
        percentage: 12,
        total: 100,
      },
    });
    handlePolishDownloadProgress({ ...ports, payload: "12%" });

    expect(received).toEqual([]);
    expect(progress).toEqual([]);
  });

  test("does not let a stale initial snapshot replace a newer live status", async () => {
    const deferred = Promise.withResolvers<unknown>();
    const received: Array<{ message: string; state: string }> = [];
    const synchronizer = createPolishStatusSynchronizer({
      isStopped: () => false,
      readStatus: () => deferred.promise,
      setStatus: (status) => received.push(status),
    });

    const initialRefresh = synchronizer.refresh();
    synchronizer.accept({ message: "Polish ready", state: "ready" });
    deferred.resolve({ message: "Downloading Polish", state: "downloading" });
    await initialRefresh;

    expect(received).toEqual([{ message: "Polish ready", state: "ready" }]);
  });

  test("refreshes status when a download command succeeds without events", async () => {
    const progress: Array<PolishModelProgress | undefined> = [];
    const received: PolishStatus[] = [];
    const synchronizer = createPolishStatusSynchronizer({
      isStopped: () => false,
      readStatus: () =>
        Promise.resolve({ message: "Polish ready", state: "ready" }),
      setStatus: (status) => received.push(status),
    });

    await runPolishModelCommand({
      invokeCommand: () => Promise.resolve(),
      setProgress: (nextProgress) => progress.push(nextProgress),
      statusSynchronizer: synchronizer,
    });

    expect(progress).toEqual([{ percentage: 0, phase: "download" }, undefined]);
    expect(received).toEqual([
      { message: "Downloading Polish model", state: "downloading" },
      { message: "Polish ready", state: "ready" },
    ]);
  });

  test("does not let an initial snapshot overwrite a command state", async () => {
    const initialStatus = Promise.withResolvers<unknown>();
    const command = Promise.withResolvers<unknown>();
    const received: PolishStatus[] = [];
    let reads = 0;
    const synchronizer = createPolishStatusSynchronizer({
      isStopped: () => false,
      readStatus: () => {
        reads += 1;
        if (reads === 1) {
          return initialStatus.promise;
        }
        return Promise.resolve({ message: "Polish ready", state: "ready" });
      },
      setStatus: (status) => received.push(status),
    });
    const staleRefresh = synchronizer.refresh();
    const download = runPolishModelCommand({
      invokeCommand: () => command.promise,
      setProgress: () => undefined,
      statusSynchronizer: synchronizer,
    });

    initialStatus.resolve({
      message: "Download Polish",
      state: "not_downloaded",
    });
    await staleRefresh;
    expect(received).toEqual([
      { message: "Downloading Polish model", state: "downloading" },
    ]);

    command.resolve(undefined);
    await download;
    expect(received.at(-1)).toEqual({
      message: "Polish ready",
      state: "ready",
    });
  });

  test("preserves the backend repair reason when a command rejects", async () => {
    const received: PolishStatus[] = [];
    const synchronizer = createPolishStatusSynchronizer({
      isStopped: () => false,
      readStatus: () =>
        Promise.resolve({
          message: "Polish runtime failed to start",
          state: "repair",
        }),
      setStatus: (status) => received.push(status),
    });

    await runPolishModelCommand({
      invokeCommand: () => Promise.reject(new Error("transport error")),
      setProgress: () => undefined,
      statusSynchronizer: synchronizer,
    });

    expect(received).toEqual([
      { message: "Downloading Polish model", state: "downloading" },
      { message: "Polish runtime failed to start", state: "repair" },
    ]);
  });

  test("uses setup recovery when rejected command status is unavailable", async () => {
    const received: PolishStatus[] = [];
    const synchronizer = createPolishStatusSynchronizer({
      isStopped: () => false,
      readStatus: () => Promise.resolve({ state: "repair" }),
      setStatus: (status) => received.push(status),
    });

    await runPolishModelCommand({
      invokeCommand: () => Promise.reject(new Error("transport error")),
      setProgress: () => undefined,
      statusSynchronizer: synchronizer,
    });

    expect(received.at(-1)).toEqual(polishModelFailure("setup"));
  });

  test("clears stale progress when a live status leaves downloading", () => {
    const progress: Array<number | undefined> = [];
    const received: PolishStatus[] = [];

    acceptPolishModelStatus({
      setProgress: (nextProgress) => progress.push(nextProgress),
      status: { message: "Verifying Polish model", state: "verifying" },
      statusSynchronizer: {
        accept: (status) => received.push(status),
      },
    });

    expect(progress).toEqual([undefined]);
    expect(received).toEqual([
      { message: "Verifying Polish model", state: "verifying" },
    ]);
  });

  test("a refreshed status becomes the state later events are judged against", async () => {
    const synchronizer = createPolishStatusSynchronizer({
      isStopped: () => false,
      readStatus: () =>
        Promise.resolve({ message: "Loading Polish model", state: "loading" }),
      setStatus: () => undefined,
    });

    await synchronizer.refresh();

    expect(synchronizer.currentState()).toBe("loading");
  });

  test("a late download event never reopens a status that moved on", async () => {
    const received: PolishStatus[] = [];
    const progress: PolishModelProgress[] = [];
    const synchronizer = createPolishStatusSynchronizer({
      isStopped: () => false,
      readStatus: () =>
        Promise.resolve({ message: "Loading Polish model", state: "loading" }),
      setStatus: (status) => received.push(status),
    });

    await synchronizer.refresh();
    handlePolishDownloadProgress({
      payload: {
        downloaded: 2_497_280_448,
        model_id: "polish-qwen3-4b-instruct-2507",
        percentage: 100,
        total: 2_497_280_448,
      },
      setProgress: (nextProgress) => progress.push(nextProgress),
      statusSynchronizer: synchronizer,
    });

    expect(progress).toEqual([]);
    expect(received).toEqual([
      { message: "Loading Polish model", state: "loading" },
    ]);
  });

  /// A duplicate download joins the transfer already running: the command
  /// returns at once and must not blank the bar the running transfer feeds.
  test("keeps the progress bar when the command returns to a running transfer", async () => {
    const progress: Array<PolishModelProgress | undefined> = [];
    const synchronizer = createPolishStatusSynchronizer({
      isStopped: () => false,
      readStatus: () =>
        Promise.resolve({
          message: "Downloading Polish model",
          state: "downloading",
        }),
      setStatus: () => undefined,
    });

    await runPolishModelCommand({
      invokeCommand: () => Promise.resolve(),
      setProgress: (nextProgress) => progress.push(nextProgress),
      statusSynchronizer: synchronizer,
    });

    expect(progress).toStrictEqual([{ percentage: 0, phase: "download" }]);
  });

  test("invalidates stale effect lifecycles without stopping the current one", () => {
    const received: PolishStatus[] = [];
    const session = createPolishModelSession({
      readStatus: () => Promise.resolve({ state: "ready" }),
      setStatus: (status) => received.push(status),
    });
    const staleLifecycle = session.begin();
    const currentLifecycle = session.begin();

    expect(staleLifecycle.isStopped()).toBe(true);
    staleLifecycle.stop();
    session.accept({ message: "Polish ready", state: "ready" });
    expect(received).toEqual([{ message: "Polish ready", state: "ready" }]);

    currentLifecycle.stop();
    session.accept({ message: "Polish ready", state: "ready" });
    expect(received).toEqual([{ message: "Polish ready", state: "ready" }]);
  });
});

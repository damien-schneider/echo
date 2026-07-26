import { describe, expect, it, spyOn } from "bun:test";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { listenCancellable } from "./tauri-listener";

const flushMicrotasks = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("listenCancellable", () => {
  it("calls the resolved unlisten when torn down after the promise resolves", async () => {
    let unlistened = false;
    const subscribe = () =>
      Promise.resolve<UnlistenFn>(() => {
        unlistened = true;
      });

    const teardown = listenCancellable(subscribe);
    await flushMicrotasks();
    teardown();

    expect(unlistened).toBe(true);
  });

  it("calls the late unlisten immediately when torn down before the promise resolves", async () => {
    let unlistened = false;
    let resolveSubscribe: (fn: UnlistenFn) => void = () => {
      // replaced synchronously below
    };
    const subscribe = () =>
      new Promise<UnlistenFn>((resolve) => {
        resolveSubscribe = resolve;
      });

    const teardown = listenCancellable(subscribe);
    teardown(); // unmounted before listen() resolved
    resolveSubscribe(() => {
      unlistened = true;
    });
    await flushMicrotasks();

    expect(unlistened).toBe(true);
  });

  it("logs and does not throw when subscribe rejects", async () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => {
      // swallow expected error log
    });
    const subscribe = () => Promise.reject(new Error("listen failed"));

    const teardown = listenCancellable(subscribe);
    teardown();
    await flushMicrotasks();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});

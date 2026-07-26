import { describe, expect, test } from "bun:test";
import {
  overlayEventFailureMessage,
  subscribeEventListeners,
} from "@/features/overlay-controls/runtime/event-subscription";

describe("subscribeEventListeners", () => {
  test("starts independent registrations without waiting for earlier readiness", async () => {
    let releaseFirst = () => undefined;
    let secondStarted = false;
    const firstRegistration = new Promise<() => void>((resolve) => {
      releaseFirst = () => resolve(() => undefined);
    });

    const subscription = subscribeEventListeners({
      isCancelled: () => false,
      registrations: [
        () => firstRegistration,
        () => {
          secondStarted = true;
          return Promise.resolve(() => undefined);
        },
      ],
    });

    await Promise.resolve();
    expect(secondStarted).toBe(true);
    releaseFirst();
    const cleanup = await subscription;
    cleanup();
  });

  test("runs the snapshot only after every listener is installed", async () => {
    let releaseListener = () => undefined;
    let snapshotStarted = false;
    const listener = new Promise<() => void>((resolve) => {
      releaseListener = () => resolve(() => undefined);
    });

    const subscription = subscribeEventListeners({
      afterSubscribe: () => {
        snapshotStarted = true;
      },
      isCancelled: () => false,
      registrations: [() => listener],
    });

    await Promise.resolve();
    expect(snapshotStarted).toBe(false);
    releaseListener();
    const cleanup = await subscription;
    expect(snapshotStarted).toBe(true);
    cleanup();
  });

  test("removes listeners registered before a later registration fails", async () => {
    let cleanupCount = 0;
    const failure = new Error("event bridge unavailable");

    const subscription = subscribeEventListeners({
      isCancelled: () => false,
      registrations: [
        () =>
          Promise.resolve(() => {
            cleanupCount += 1;
          }),
        () => Promise.reject(failure),
      ],
    });

    await expect(subscription).rejects.toThrow("event bridge unavailable");
    expect(cleanupCount).toBe(1);
  });

  test("removes pending listeners when registration throws synchronously", async () => {
    let cleanupCount = 0;
    const failure = new Error("invalid event registration");

    const subscription = subscribeEventListeners({
      isCancelled: () => false,
      registrations: [
        () =>
          Promise.resolve(() => {
            cleanupCount += 1;
          }),
        () => {
          throw failure;
        },
      ],
    });

    await expect(subscription).rejects.toThrow("invalid event registration");
    expect(cleanupCount).toBe(1);
  });

  test("stops registering and removes listeners when cancelled mid-setup", async () => {
    const cleanupCounts = [0, 0];
    let cancelled = false;
    let thirdRegistrationCount = 0;

    const cleanup = await subscribeEventListeners({
      isCancelled: () => cancelled,
      registrations: [
        () =>
          Promise.resolve(() => {
            cleanupCounts[0] += 1;
          }),
        () => {
          cancelled = true;
          return Promise.resolve(() => {
            cleanupCounts[1] += 1;
          });
        },
        () => {
          thirdRegistrationCount += 1;
          return Promise.resolve(() => undefined);
        },
      ],
    });

    expect(cleanupCounts).toEqual([1, 1]);
    expect(thirdRegistrationCount).toBe(0);
    cleanup();
    expect(cleanupCounts).toEqual([1, 1]);
  });

  test("returns an idempotent cleanup for a complete subscription", async () => {
    let cleanupCount = 0;
    const cleanup = await subscribeEventListeners({
      isCancelled: () => false,
      registrations: [
        () =>
          Promise.resolve(() => {
            cleanupCount += 1;
          }),
      ],
    });

    cleanup();
    cleanup();

    expect(cleanupCount).toBe(1);
  });

  test("absorbs an asynchronous native unlisten failure", async () => {
    const cleanup = await subscribeEventListeners({
      isCancelled: () => false,
      registrations: [
        () =>
          Promise.resolve(() =>
            Promise.reject(new Error("native listener was already removed"))
          ),
      ],
    });

    cleanup();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });

  test("provides stable English recovery copy for subscription failures", () => {
    expect(overlayEventFailureMessage).toBe(
      "Echo controls lost their connection. Reopen Echo and try again."
    );
  });
});

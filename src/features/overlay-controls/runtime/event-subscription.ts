import type { UnlistenFn } from "@tauri-apps/api/event";

export const overlayEventFailureMessage =
  "Echo controls lost their connection. Reopen Echo and try again.";

interface EventSubscriptionOptions {
  afterSubscribe?: () => Promise<void> | void;
  isCancelled: () => boolean;
  registrations: ReadonlyArray<() => Promise<UnlistenFn>>;
}

const safelyUnlisten = (unlisten: UnlistenFn) => {
  try {
    Promise.resolve(unlisten()).catch(() => undefined);
  } catch {
    return;
  }
};

const createCleanup = (listeners: UnlistenFn[]) => {
  let isCleaned = false;
  return () => {
    if (isCleaned) {
      return;
    }
    isCleaned = true;
    for (const unlisten of listeners) {
      safelyUnlisten(unlisten);
    }
  };
};

export const subscribeEventListeners = async ({
  afterSubscribe,
  isCancelled,
  registrations,
}: EventSubscriptionOptions) => {
  const listeners: UnlistenFn[] = [];
  const cleanup = createCleanup(listeners);
  const pending: Promise<UnlistenFn>[] = [];
  for (const register of registrations) {
    if (isCancelled()) {
      break;
    }
    try {
      pending.push(register());
    } catch (error) {
      pending.push(Promise.reject(error));
      break;
    }
    if (isCancelled()) {
      break;
    }
  }
  const failures: unknown[] = [];
  for (const result of await Promise.allSettled(pending)) {
    if (result.status === "fulfilled") {
      listeners.push(result.value);
    } else {
      failures.push(result.reason);
    }
  }
  if (failures.length > 0) {
    cleanup();
    throw failures[0];
  }
  if (!(isCancelled() || !afterSubscribe)) {
    try {
      await afterSubscribe();
    } catch (error) {
      cleanup();
      throw error;
    }
  }
  if (isCancelled()) {
    cleanup();
  }
  return cleanup;
};

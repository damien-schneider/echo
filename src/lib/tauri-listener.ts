import type { UnlistenFn } from "@tauri-apps/api/event";

// teardown may beat the subscribe promise — the late unlisten fires at once so nothing leaks
export const listenCancellable = (
  subscribe: () => Promise<UnlistenFn>
): UnlistenFn => {
  let active = true;
  let unlisten: UnlistenFn | undefined;

  subscribe()
    .then((fn) => {
      if (active) {
        unlisten = fn;
      } else {
        fn();
      }
    })
    .catch((error: unknown) => {
      console.error("listenCancellable: subscribe failed", error);
    });

  return () => {
    active = false;
    unlisten?.();
  };
};

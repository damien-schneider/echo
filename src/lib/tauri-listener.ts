import type { UnlistenFn } from "@tauri-apps/api/event";

// Subscribe to a Tauri listener that may be torn down before its promise resolves.
// If teardown runs first, the late unlisten fires immediately so no listener leaks.
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

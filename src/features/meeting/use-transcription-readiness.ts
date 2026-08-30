import { useEffect } from "react";
import { useModelStore } from "@/stores/model-store";

export const useTranscriptionReadiness = () => {
  const profiles = useModelStore((s) => s.profiles);
  const downloadProgress = useModelStore((s) => s.downloadProgress);
  const selectProfile = useModelStore((s) => s.selectProfile);
  const initialize = useModelStore((s) => s.initialize);
  const setupListeners = useModelStore((s) => s.setupListeners);

  useEffect(() => {
    initialize().catch(() => undefined);
    let cancelled = false;
    let stop: (() => void) | undefined;
    setupListeners().then((cleanup) => {
      if (cancelled) {
        cleanup();
      } else {
        stop = cleanup;
      }
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [initialize, setupListeners]);

  const active = profiles.find((profile) => profile.is_active);
  const downloadedFallback = profiles.find((profile) => profile.is_downloaded);
  const target = downloadedFallback ?? active;
  return {
    downloading: active?.is_downloading ?? false,
    known: profiles.length > 0,
    progress: active ? downloadProgress.get(active.size) : undefined,
    ready: active?.is_downloaded ?? false,
    // Failures land in the model store's `error`, which the settings row displays.
    resolve: (): Promise<void> =>
      target
        ? selectProfile(target.size).catch(() => undefined)
        : Promise.resolve(),
    resolveLabel: downloadedFallback
      ? `Use ${downloadedFallback.label}`
      : "Download model",
  };
};

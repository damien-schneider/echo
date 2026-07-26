import { useEffect } from "react";
import EchoLogo from "@/components/icons/echo-logo";
import { TranscriptionProfileCard } from "@/components/model-selector/transcription-profile-card";
import type { TranscriptionModelSize } from "@/lib/types";
import { useModelStore } from "@/stores/model-store";

interface OnboardingProps {
  onModelSelected: () => void;
}

const Onboarding = ({ onModelSelected }: OnboardingProps) => {
  const profiles = useModelStore((state) => state.profiles);
  const modelStatus = useModelStore((state) => state.modelStatus);
  const error = useModelStore((state) => state.error);
  const downloadProgress = useModelStore((state) => state.downloadProgress);
  const downloadStats = useModelStore((state) => state.downloadStats);
  const initialize = useModelStore((state) => state.initialize);
  const selectProfile = useModelStore((state) => state.selectProfile);
  const setupListeners = useModelStore((state) => state.setupListeners);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    initialize();
    setupListeners().then((stop) => {
      if (cancelled) {
        stop();
      } else {
        cleanup = stop;
      }
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [initialize, setupListeners]);

  const handleSelect = async (size: TranscriptionModelSize) => {
    try {
      await selectProfile(size);
      onModelSelected();
    } catch {
      // Store exposes the actionable error in this screen.
    }
  };

  const isBusy = modelStatus === "loading" || modelStatus === "downloading";

  return (
    <div className="pt-8 pb-12">
      <div className="h-8 w-full shrink-0 select-none" data-tauri-drag-region />
      <div
        className="mb-12 flex shrink-0 flex-col items-center gap-2 px-6"
        data-tauri-drag-region
      >
        <EchoLogo data-tauri-drag-region variant="full" width={120} />
        <p className="mx-auto mt-2 max-w-md text-center font-light text-foreground/60">
          Choose how much local transcription quality this computer should use.
        </p>
      </div>

      <div className="mx-auto flex w-full max-w-[600px] flex-col gap-3 px-6">
        {error ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4">
            <p className="text-destructive text-sm">{error}</p>
          </div>
        ) : null}

        {profiles.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground text-sm">
            Loading local transcription options…
          </p>
        ) : (
          profiles.map((profile) => {
            const progress = downloadProgress.get(profile.size);
            const stats = downloadStats.get(profile.size);
            return (
              <TranscriptionProfileCard
                downloadProgress={progress?.percentage}
                downloadSpeed={stats?.speed}
                isBusy={isBusy}
                key={profile.size}
                onSelect={() => handleSelect(profile.size)}
                profile={profile}
              />
            );
          })
        )}
      </div>
    </div>
  );
};

export default Onboarding;

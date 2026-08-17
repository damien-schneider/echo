import { AlertCircle, CircleCheck, CircleDashed } from "lucide-react";
import { useEffect } from "react";
import { TranscriptionProfileCard } from "@/components/model-selector/transcription-profile-card";
import { PolishStatusCard } from "@/components/settings/models/polish-status-card";
import { usePolishModel } from "@/features/polish/use-polish-model";
import type { TranscriptionModelSize } from "@/lib/types";
import { useModelStore } from "@/stores/model-store";

const statusCopy = {
  downloading: "Downloading local model",
  error: "Transcription model error",
  loading: "Preparing local model",
  none: "Choose a model size",
  ready: "Local transcription ready",
  unloaded: "Local model is not loaded",
} as const;

const renderStatusIcon = (modelStatus: keyof typeof statusCopy) => {
  if (modelStatus === "ready") {
    return (
      <CircleCheck
        aria-hidden="true"
        className="h-4 w-4 text-muted-foreground"
      />
    );
  }
  if (modelStatus === "error") {
    return (
      <AlertCircle
        aria-hidden="true"
        className="h-4 w-4 text-muted-foreground"
      />
    );
  }
  return (
    <CircleDashed
      aria-hidden="true"
      className="h-4 w-4 text-muted-foreground"
    />
  );
};

export const ModelsSettings = () => {
  const polish = usePolishModel();
  const profiles = useModelStore((state) => state.profiles);
  const modelStatus = useModelStore((state) => state.modelStatus);
  const error = useModelStore((state) => state.error);
  const downloadProgress = useModelStore((state) => state.downloadProgress);
  const downloadStats = useModelStore((state) => state.downloadStats);
  const initialize = useModelStore((state) => state.initialize);
  const selectProfile = useModelStore((state) => state.selectProfile);
  const deleteProfile = useModelStore((state) => state.deleteProfile);
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
    } catch {
      // Store exposes the actionable error below.
    }
  };

  const handleDelete = async (size: TranscriptionModelSize) => {
    try {
      await deleteProfile(size);
    } catch {
      // Store exposes the actionable error below.
    }
  };

  const isBusy = modelStatus === "loading" || modelStatus === "downloading";
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-20">
      <div className="rounded-lg border border-border/20 bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          {renderStatusIcon(modelStatus)}
          <div>
            <p className="font-medium text-sm">{statusCopy[modelStatus]}</p>
            <p className="text-muted-foreground text-xs">
              Audio is transcribed on this computer.
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-destructive text-sm">
          {error}
        </div>
      ) : null}

      <div className="space-y-3">
        {profiles.map((profile) => {
          const progress = downloadProgress.get(profile.size);
          const stats = downloadStats.get(profile.size);
          return (
            <TranscriptionProfileCard
              downloadProgress={progress?.percentage}
              downloadSpeed={stats?.speed}
              isBusy={isBusy}
              key={profile.size}
              onDelete={() => handleDelete(profile.size)}
              onSelect={() => handleSelect(profile.size)}
              profile={profile}
            />
          );
        })}
      </div>
      <PolishStatusCard
        onDownload={polish.download}
        onRepair={polish.repair}
        progress={polish.progress?.percentage}
        status={polish.status}
      />
    </div>
  );
};

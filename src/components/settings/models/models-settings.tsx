import { useEffect } from "react";
import { TranscriptionModelRow } from "@/components/model-selector/transcription-model-row";
import { LegacyModelFilesSection } from "@/components/settings/models/legacy-model-files-section";
import { MeetingModelsSection } from "@/components/settings/models/meeting-model-rows";
import { PolishLevelSlider } from "@/components/settings/models/polish-level-slider";
import { PolishModelRow } from "@/components/settings/models/polish-model-row";
import { usePolishModel } from "@/features/polish/use-polish-model";
import { SettingsSection } from "@/features/settings/settings-section";
import type { TranscriptionModelSize } from "@/lib/types";
import { useModelStore } from "@/stores/model-store";

export const ModelsSettings = () => {
  const polish = usePolishModel();
  const profiles = useModelStore((state) => state.profiles);
  const modelStatus = useModelStore((state) => state.modelStatus);
  const loadingSize = useModelStore((state) => state.loadingSize);
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

  const isBusy = modelStatus === "loading" || modelStatus === "downloading";
  return (
    <div className="space-y-5">
      <SettingsSection
        description="Audio is transcribed on this computer."
        title="Transcription"
      >
        {profiles.map((profile) => (
          <TranscriptionModelRow
            downloadProgress={downloadProgress.get(profile.size)?.percentage}
            downloadSpeed={downloadStats.get(profile.size)?.speed}
            isBusy={isBusy}
            isLoading={loadingSize === profile.size}
            key={profile.size}
            onDelete={() => deleteProfile(profile.size)}
            onSelect={() => handleSelect(profile.size)}
            profile={profile}
          />
        ))}
        {error ? (
          <p className="text-caption text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </SettingsSection>
      <SettingsSection title="Language model">
        <PolishModelRow
          onDelete={polish.remove}
          onDownload={polish.download}
          onRepair={polish.repair}
          progress={polish.progress?.percentage}
          status={polish.status}
        />
        <PolishLevelSlider />
      </SettingsSection>
      <MeetingModelsSection />
      <LegacyModelFilesSection />
    </div>
  );
};

import { Button } from "@ctrl-ui/react/ui/button";
import { useEffect } from "react";
import { TranscriptionModelRow } from "@/components/model-selector/transcription-model-row";
import { LegacyModelFilesSection } from "@/components/settings/models/legacy-model-files-section";
import { MeetingModelsSection } from "@/components/settings/models/meeting-model-rows";
import { PolishModelRow } from "@/components/settings/models/polish-model-row";
import { usePolishCatalog } from "@/components/settings/models/use-polish-catalog";
import { usePolishModel } from "@/features/polish/use-polish-model";
import { SettingsSection } from "@/features/settings/settings-section";
import type { TranscriptionModelSize } from "@/lib/types";
import { useModelStore } from "@/stores/model-store";

const PolishModelsSettings = () => {
  const { status } = usePolishModel();
  const { action, actionError, catalog, catalogError, retry, run, transfers } =
    usePolishCatalog();
  const activeModel = catalog?.models.find((model) => model.is_active);
  const voiceCommandModel = catalog?.models.find(
    (model) => model.supports_voice_commands
  );
  const selectingModelId = catalog?.selecting_model_id;
  const switchingToModelId =
    action?.command === "select_polish_model"
      ? action.modelId
      : selectingModelId;
  const activeStatus =
    (!status.model || status.model.id === activeModel?.id) &&
    (!switchingToModelId || switchingToModelId === activeModel?.id)
      ? status
      : undefined;
  const activeState = activeStatus?.state;
  const isActiveModelSettingUp =
    activeState === "preparing" ||
    activeState === "downloading" ||
    activeState === "verifying" ||
    activeState === "loading";
  const isBusy = Boolean(
    action ||
      catalogError ||
      selectingModelId ||
      catalog?.models.some((model) => model.is_downloading) ||
      isActiveModelSettingUp
  );

  return (
    <SettingsSection
      description={
        voiceCommandModel
          ? `Runs Chat, Polish, and meeting summaries on this computer. Voice commands require ${voiceCommandModel.name}.`
          : "Runs Chat, Polish, and meeting summaries on this computer."
      }
      title="Language model"
    >
      {catalogError ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-caption text-destructive" role="alert">
            {catalogError}
          </p>
          <Button onClick={retry} size="sm" variant="surface">
            Retry
          </Button>
        </div>
      ) : null}
      {catalog || catalogError ? null : (
        <p className="text-caption text-muted-foreground" role="status">
          Loading language models…
        </p>
      )}
      {catalog?.models.map((model) => (
        <PolishModelRow
          activeStatus={model.is_active ? activeStatus : undefined}
          error={
            actionError?.modelId === model.id ? actionError.message : undefined
          }
          isBusy={isBusy}
          isDeleting={
            action?.modelId === model.id && action.command === "delete_model"
          }
          isRepairing={
            action?.modelId === model.id &&
            action.command === "repair_polish_model"
          }
          isSelecting={
            (action?.modelId === model.id &&
              action.command === "select_polish_model") ||
            (selectingModelId === model.id &&
              action?.command !== "delete_model")
          }
          key={model.id}
          model={model}
          onDelete={() => run("delete_model", model.id)}
          onRepair={() => run("repair_polish_model", model.id)}
          onSelect={() => run("select_polish_model", model.id)}
          transfer={transfers.get(model.id)}
        />
      ))}
    </SettingsSection>
  );
};

export const ModelsSettings = () => {
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
      <PolishModelsSettings />
      <MeetingModelsSection />
      <LegacyModelFilesSection />
    </div>
  );
};

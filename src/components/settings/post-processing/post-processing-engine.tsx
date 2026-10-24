import { Button } from "@ctrl-ui/react/ui/button";
import { Switch } from "@ctrl-ui/react/ui/switch";
import { CircleNotchIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import { AiProviderSettings } from "@/components/settings/post-processing-settings-api/ai-provider-settings";
import { usePolishModel } from "@/features/polish/use-polish-model";
import { SettingRow } from "@/features/settings/setting-row";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

const LocalModelRow = () => {
  const polish = usePolishModel();
  const { state } = polish.status;
  if (state === "not_downloaded") {
    return (
      <SettingRow
        description="One-time 2.5 GB download. Until then, dictations paste without post-processing."
        title="Echo 4B"
      >
        <Button
          onClick={polish.download}
          size="sm"
          tone="primary"
          variant="solid"
        >
          <DownloadSimpleIcon aria-hidden="true" className="mr-1 h-4 w-4" />
          Download
        </Button>
      </SettingRow>
    );
  }
  if (state === "repair") {
    return (
      <SettingRow
        description={polish.status.message}
        title="Echo 4B needs repair"
      >
        <Button onClick={polish.repair} size="sm" variant="surface">
          Repair
        </Button>
      </SettingRow>
    );
  }
  if (state === "downloading") {
    const percentage = Math.round(polish.progress?.percentage ?? 0);
    return (
      <SettingRow description="One-time 2.5 GB download." title="Echo 4B">
        <span className="flex items-center gap-1.5 text-caption text-muted-foreground tabular-nums">
          <CircleNotchIcon
            aria-hidden="true"
            className="h-3.5 w-3.5 animate-spin"
          />
          {percentage}%
        </span>
      </SettingRow>
    );
  }
  return (
    <SettingRow
      description="Runs on this computer. Nothing you dictate leaves it."
      title="Echo 4B"
    >
      <span className="text-caption text-muted-foreground">
        {state === "ready" ? "Ready" : "Preparing…"}
      </span>
    </SettingRow>
  );
};

export const PostProcessingEngineSettings = () => {
  const engine = useSetting("post_process_engine") ?? "local";
  const isUpdating = useIsSettingUpdating("post_process_engine");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  return (
    <>
      <SettingRow
        description="Post-processing runs on Echo 4B on this computer. Turn this on to send transcripts to an AI provider instead."
        title="Post-process in the cloud"
      >
        <Switch
          checked={engine === "cloud"}
          disabled={isUpdating}
          onCheckedChange={(enabled) =>
            updateSetting("post_process_engine", enabled ? "cloud" : "local")
          }
        />
      </SettingRow>
      {engine === "cloud" ? <AiProviderSettings /> : <LocalModelRow />}
    </>
  );
};

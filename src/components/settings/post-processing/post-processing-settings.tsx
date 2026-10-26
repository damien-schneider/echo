import { Button } from "@ctrl-ui/react/ui/button";
import { Switch } from "@ctrl-ui/react/ui/switch";
import { CubeIcon } from "@phosphor-icons/react";
import { PostProcessingSettingsPrompts } from "@/components/settings/post-processing/prompt-settings";
import { VoiceCommandsSettings } from "@/components/settings/post-processing/voice-commands";
import {
  OPEN_MODELS_LABEL,
  openModelsPage,
} from "@/features/meeting/open-models-page";
import { polishModelName } from "@/features/polish/polish-model-state";
import { usePolishModel } from "@/features/polish/use-polish-model";
import { SettingRow } from "@/features/settings/setting-row";
import { SettingsSection } from "@/features/settings/settings-section";
import { getNormalizedOsPlatform } from "@/lib/os";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

// Linux has no focus probe, so Echo never learns that no text field has focus.
const voiceCommandsAreAvailable = getNormalizedOsPlatform() !== "linux";

const MODEL_SETUP_TITLES = {
  not_downloaded: `Download ${polishModelName}`,
  repair: `Repair ${polishModelName}`,
} as const;

const LocalModelSetup = () => {
  const { status } = usePolishModel();
  if (status.state !== "not_downloaded" && status.state !== "repair") {
    return null;
  }
  return (
    <SettingsSection title="Model">
      <SettingRow
        description={
          voiceCommandsAreAvailable
            ? "Rewrite and voice commands run on it."
            : "Rewrite runs on it."
        }
        icon={<CubeIcon className="h-4 w-4" />}
        title={MODEL_SETUP_TITLES[status.state]}
      >
        <Button onClick={openModelsPage} size="sm" variant="surface">
          {OPEN_MODELS_LABEL}
        </Button>
      </SettingRow>
    </SettingsSection>
  );
};

const RewriteToggle = () => {
  const rewriteEnabled = useSetting("post_process_enabled") ?? false;
  const isUpdating = useIsSettingUpdating("post_process_enabled");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  return (
    <SettingRow
      description={`Runs your prompt with ${polishModelName} first. The paste waits for it.`}
      title="Rewrite before pasting"
    >
      <Switch
        checked={rewriteEnabled}
        disabled={isUpdating}
        onCheckedChange={(value) =>
          updateSetting("post_process_enabled", value)
        }
      />
    </SettingRow>
  );
};

export const PostProcessingSettings = () => (
  <div className="space-y-5">
    <LocalModelSetup />

    <SettingsSection title="Rewrite">
      <RewriteToggle />
      <PostProcessingSettingsPrompts />
    </SettingsSection>

    {voiceCommandsAreAvailable && <VoiceCommandsSettings />}
  </div>
);

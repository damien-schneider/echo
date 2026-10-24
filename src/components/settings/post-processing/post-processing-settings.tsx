import { Switch } from "@ctrl-ui/react/ui/switch";
import { PostProcessingSettingsPrompts } from "@/components/settings/post-processing/prompt-settings";
import { VoiceCommandsSettings } from "@/components/settings/post-processing/voice-commands";
import { SettingRow } from "@/features/settings/setting-row";
import { SettingsSection } from "@/features/settings/settings-section";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

const PostProcessingEnableToggle = () => {
  const postProcessEnabled = useSetting("post_process_enabled") ?? false;
  const isPostProcessUpdating = useIsSettingUpdating("post_process_enabled");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  return (
    <SettingRow
      description="Refine transcriptions with a prompt, and run voice commands."
      title="Post-process transcriptions"
    >
      <Switch
        checked={postProcessEnabled}
        disabled={isPostProcessUpdating}
        onCheckedChange={(value) =>
          updateSetting("post_process_enabled", value)
        }
      />
    </SettingRow>
  );
};
export const PostProcessingSettings = () => (
  <div className="space-y-5">
    <SettingsSection title="General">
      <PostProcessingEnableToggle />
    </SettingsSection>

    <VoiceCommandsSettings />

    <SettingsSection title="Prompt">
      <PostProcessingSettingsPrompts />
    </SettingsSection>
  </div>
);

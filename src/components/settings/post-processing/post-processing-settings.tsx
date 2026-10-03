import { Switch } from "@ctrl-ui/react/ui/switch";
import { PostProcessingSettingsApi } from "@/components/settings/post-processing/post-processing-api-settings";
import { PostProcessingSettingsPrompts } from "@/components/settings/post-processing/prompt-settings";
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
      description="Enable LLM post-processing to refine transcriptions using custom prompts."
      title="Enable Post Processing"
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
  <div className="mx-auto w-full max-w-3xl pb-20">
    <SettingsSection title="General">
      <PostProcessingEnableToggle />
    </SettingsSection>

    <SettingsSection title="AI Providers">
      <PostProcessingSettingsApi />
    </SettingsSection>

    <SettingsSection title="Prompt">
      <PostProcessingSettingsPrompts />
    </SettingsSection>
  </div>
);

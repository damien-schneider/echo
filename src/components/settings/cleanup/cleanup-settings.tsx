import { Switch } from "@ctrl-ui/react/ui/switch";
import { Sparkles } from "lucide-react";
import { DictionaryEditor } from "@/components/settings/cleanup/dictionary-editor";
import { SettingRow } from "@/features/settings/setting-row";
import { SettingsSection } from "@/features/settings/settings-section";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

const CleanupEnabledToggle = () => {
  const enabled = useSetting("cleanup_enabled") ?? false;
  const updating = useIsSettingUpdating("cleanup_enabled");
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  return (
    <SettingRow
      description="Apply local hallucination filtering and your dictionary without downloading another model."
      icon={<Sparkles className="h-4 w-4" />}
      title="Enable Lightweight Cleanup"
    >
      <Switch
        checked={enabled}
        disabled={updating}
        onCheckedChange={(value) => updateSetting("cleanup_enabled", value)}
      />
    </SettingRow>
  );
};
export const CleanupSettings = () => (
  <div className="mx-auto w-full max-w-3xl pb-20">
    <SettingsSection defaultOpen={true} title="Local Cleanup">
      <CleanupEnabledToggle />
    </SettingsSection>

    <SettingsSection defaultOpen={true} title="Dictionary">
      <DictionaryEditor />
    </SettingsSection>
  </div>
);

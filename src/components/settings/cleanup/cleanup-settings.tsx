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
      description="Remove stray phrases and apply your dictionary on this device."
      icon={<Sparkles className="h-4 w-4" />}
      title="Clean up transcriptions"
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
  <div className="space-y-5">
    <SettingsSection defaultOpen={true} title="On-device cleanup">
      <CleanupEnabledToggle />
    </SettingsSection>

    <SettingsSection defaultOpen={true} title="Dictionary">
      <DictionaryEditor />
    </SettingsSection>
  </div>
);

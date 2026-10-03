import { Switch } from "@ctrl-ui/react/ui/switch";
import { Keyboard } from "lucide-react";
import { SettingRow } from "@/features/settings/setting-row";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";
export const InputTrackingToggle = () => {
  const inputTrackingEnabled = useSetting("input_tracking_enabled") ?? false;
  const updating = useIsSettingUpdating("input_tracking_enabled");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  return (
    <SettingRow
      description="Save text as you type across apps. Requires Accessibility access."
      icon={<Keyboard className="h-4 w-4" />}
      title="Track typed text"
    >
      <Switch
        checked={inputTrackingEnabled}
        disabled={updating}
        onCheckedChange={(enabled) =>
          updateSetting("input_tracking_enabled", enabled)
        }
      />
    </SettingRow>
  );
};

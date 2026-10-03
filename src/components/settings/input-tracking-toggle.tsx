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
      description="Track text typed in any application. Entries are saved when switching apps, clicking, or after idle timeout. Requires accessibility permissions."
      icon={<Keyboard className="h-4 w-4" />}
      title="Enable Input Tracking"
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

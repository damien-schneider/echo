import { Switch } from "@ctrl-ui/react/ui/switch";
import { PlayCircleIcon } from "@phosphor-icons/react";
import { SettingRow } from "@/features/settings/setting-row";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";
export const AutostartToggle = () => {
  const autostartEnabled = useSetting("autostart_enabled") ?? false;
  const updating = useIsSettingUpdating("autostart_enabled");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  return (
    <SettingRow
      icon={<PlayCircleIcon className="h-4 w-4" />}
      title="Launch at login"
    >
      <Switch
        checked={autostartEnabled}
        disabled={updating}
        onCheckedChange={(enabled) =>
          updateSetting("autostart_enabled", enabled)
        }
      />
    </SettingRow>
  );
};

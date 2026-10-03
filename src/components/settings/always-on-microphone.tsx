import { Switch } from "@ctrl-ui/react/ui/switch";
import { SettingRow } from "@/features/settings/setting-row";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";
export const AlwaysOnMicrophone = () => {
  const alwaysOnMode = useSetting("always_on_microphone");
  const updating = useIsSettingUpdating("always_on_microphone");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  return (
    <SettingRow
      description="Keep microphone active for low latency recording. This may prevent your computer from sleeping."
      title="Always-On Microphone"
    >
      <Switch
        checked={alwaysOnMode === true}
        disabled={updating || alwaysOnMode === undefined}
        onCheckedChange={(enabled) =>
          updateSetting("always_on_microphone", enabled)
        }
      />
    </SettingRow>
  );
};

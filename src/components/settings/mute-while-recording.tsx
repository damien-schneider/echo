import { Switch } from "@ctrl-ui/react/ui/switch";
import { SettingRow } from "@/features/settings/setting-row";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";
export const MuteWhileRecording = () => {
  const muteEnabled = useSetting("mute_while_recording") ?? false;
  const updating = useIsSettingUpdating("mute_while_recording");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  return (
    <SettingRow
      description="Automatically mute all sound output while Echo is recording, then restore it when finished."
      title="Mute While Recording"
    >
      <Switch
        checked={muteEnabled}
        disabled={updating}
        onCheckedChange={(enabled) =>
          updateSetting("mute_while_recording", enabled)
        }
      />
    </SettingRow>
  );
};

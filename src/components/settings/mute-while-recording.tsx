import { SettingContainer } from "@/components/ui/setting-container";
import { Switch } from "@/components/ui/switch";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

interface MuteWhileRecordingToggleProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const MuteWhileRecording = ({
  descriptionMode = "tooltip",
  grouped = false,
}: MuteWhileRecordingToggleProps) => {
  const muteEnabled = useSetting("mute_while_recording") ?? false;
  const updating = useIsSettingUpdating("mute_while_recording");
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  return (
    <SettingContainer
      description="Automatically mute all sound output while Echo is recording, then restore it when finished."
      descriptionMode={descriptionMode}
      grouped={grouped}
      title="Mute While Recording"
    >
      <Switch
        checked={muteEnabled}
        disabled={updating}
        onCheckedChange={(enabled) =>
          updateSetting("mute_while_recording", enabled)
        }
      />
    </SettingContainer>
  );
};

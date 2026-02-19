import { SettingContainer } from "@/components/ui/setting-container";
import { Switch } from "@/components/ui/switch";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

interface AlwaysOnMicrophoneProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const AlwaysOnMicrophone = ({
  descriptionMode = "tooltip",
  grouped = false,
}: AlwaysOnMicrophoneProps) => {
  const alwaysOnMode = useSetting("always_on_microphone");
  const updating = useIsSettingUpdating("always_on_microphone");
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  return (
    <SettingContainer
      description="Keep microphone active for low latency recording. This may prevent your computer from sleeping."
      descriptionMode={descriptionMode}
      grouped={grouped}
      title="Always-On Microphone"
    >
      <Switch
        checked={alwaysOnMode}
        disabled={updating}
        onCheckedChange={(enabled) =>
          updateSetting("always_on_microphone", enabled)
        }
      />
    </SettingContainer>
  );
};

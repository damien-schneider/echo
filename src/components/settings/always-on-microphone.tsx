import React from "react";
import { Switch } from "../ui/switch";
import { SettingContainer } from "../ui/SettingContainer";
import { useSettings } from "../../hooks/useSettings";

interface AlwaysOnMicrophoneProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const AlwaysOnMicrophone: React.FC<AlwaysOnMicrophoneProps> = React.memo(({
  descriptionMode = "tooltip",
  grouped = false,
}) => {
  const { getSetting, updateSetting, isUpdating } = useSettings();

  const alwaysOnMode = getSetting("always_on_microphone") || false;

  return (
    <SettingContainer
      title="Always-On Microphone"
      description="Keep microphone active for low latency recording. This may prevent your computer from sleeping."
      descriptionMode={descriptionMode}
      grouped={grouped}
    >
      <Switch
        checked={alwaysOnMode}
        onCheckedChange={(enabled) => updateSetting("always_on_microphone", enabled)}
        disabled={isUpdating("always_on_microphone")}
      />
    </SettingContainer>
  );
});

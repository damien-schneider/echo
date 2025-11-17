import React from "react";
import { Switch } from "../ui/switch";
import { SettingContainer } from "../ui/SettingContainer";
import { useSettings } from "../../hooks/useSettings";

interface MuteWhileRecordingToggleProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const MuteWhileRecording: React.FC<MuteWhileRecordingToggleProps> =
  React.memo(({ descriptionMode = "tooltip", grouped = false }) => {
    const { getSetting, updateSetting, isUpdating } = useSettings();

    const muteEnabled = getSetting("mute_while_recording") ?? false;

    return (
      <SettingContainer
        title="Mute While Recording"
        description="Automatically mute all sound output while Echo is recording, then restore it when finished."
        descriptionMode={descriptionMode}
        grouped={grouped}
      >
        <Switch
          checked={muteEnabled}
          onCheckedChange={(enabled) => updateSetting("mute_while_recording", enabled)}
          disabled={isUpdating("mute_while_recording")}
        />
      </SettingContainer>
    );
  });

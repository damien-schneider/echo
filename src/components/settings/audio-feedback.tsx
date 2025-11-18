import React from "react";
import { Bell } from "lucide-react";
import { Switch } from "../ui/switch";
import { SettingContainer } from "../ui/SettingContainer";
import { useSettings } from "../../hooks/useSettings";
import { VolumeSlider } from "./volume-slider";
import { SoundPicker } from "./sound-picker";

interface AudioFeedbackProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const AudioFeedback: React.FC<AudioFeedbackProps> = ({
  descriptionMode = "tooltip",
  grouped = false,
}) => {
  const { getSetting, updateSetting, isUpdating } = useSettings();
  const audioFeedbackEnabled = getSetting("audio_feedback") || false;

  return (
    <div className="flex flex-col">
      <SettingContainer
        title="Audio Feedback"
        description="Play sound when recording starts and stops"
        descriptionMode={descriptionMode}
        grouped={grouped}
        icon={<Bell className="w-4 h-4" />}
      >
        <Switch
          checked={audioFeedbackEnabled}
          onCheckedChange={(enabled) => updateSetting("audio_feedback", enabled)}
          disabled={isUpdating("audio_feedback")}
        />
      </SettingContainer>
    </div>
  );
};

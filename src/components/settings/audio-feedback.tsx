import { Bell } from "lucide-react";
import type React from "react";
import { SettingContainer } from "@/components/ui/setting-container";
import { Switch } from "@/components/ui/switch";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

interface AudioFeedbackProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const AudioFeedback: React.FC<AudioFeedbackProps> = ({
  descriptionMode = "tooltip",
  grouped = false,
}) => {
  const audioFeedbackEnabled = useSetting("audio_feedback");
  const updating = useIsSettingUpdating("audio_feedback");
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  return (
    <div className="flex flex-col">
      <SettingContainer
        description="Play sound when recording starts and stops"
        descriptionMode={descriptionMode}
        grouped={grouped}
        icon={<Bell className="h-4 w-4" />}
        title="Audio Feedback"
      >
        <Switch
          checked={audioFeedbackEnabled}
          disabled={updating}
          onCheckedChange={(enabled) =>
            updateSetting("audio_feedback", enabled)
          }
        />
      </SettingContainer>
    </div>
  );
};

import { Volume2 } from "lucide-react";
import type React from "react";
import { SettingSlider } from "@/features/settings/setting-slider";
import { useSetting, useSettingsStore } from "@/stores/settings-store";
export const VolumeSlider: React.FC<{
  disabled?: boolean;
}> = ({ disabled = false }) => {
  const audioFeedbackVolume = useSetting("audio_feedback_volume") ?? 0.5;
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  return (
    <SettingSlider
      disabled={disabled}
      formatValue={(value) => `${Math.round(value * 100)}%`}
      icon={<Volume2 className="h-4 w-4" />}
      label="Volume"
      max={1}
      min={0}
      onValueChange={(value: number) =>
        updateSetting("audio_feedback_volume", value)
      }
      step={0.1}
      value={audioFeedbackVolume}
    />
  );
};

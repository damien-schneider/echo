import type React from "react";
import { SettingSlider } from "@/features/settings/setting-slider";
import { useSetting, useSettingsStore } from "@/stores/settings-store";
export const WordCorrectionThreshold: React.FC = () => {
  const wordCorrectionThreshold = useSetting("word_correction_threshold");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const handleThresholdChange = (value: number) => {
    updateSetting("word_correction_threshold", value);
  };
  return (
    <SettingSlider
      description="Controls how aggressively custom words are applied. Lower values mean fewer corrections will be made, higher values mean more corrections."
      formatValue={(v) => v.toFixed(2)}
      label="Correction Threshold"
      max={1.0}
      min={0.0}
      onValueChange={handleThresholdChange}
      value={wordCorrectionThreshold ?? 0.18}
    />
  );
};

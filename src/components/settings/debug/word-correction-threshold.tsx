import type React from "react";
import { Slider } from "@/components/ui/slider";
import { useSetting, useSettingsStore } from "@/stores/settings-store";

interface WordCorrectionThresholdProps {
  descriptionMode?: "tooltip" | "inline";
  grouped?: boolean;
}

export const WordCorrectionThreshold: React.FC<
  WordCorrectionThresholdProps
> = ({ descriptionMode = "tooltip", grouped = false }) => {
  const wordCorrectionThreshold = useSetting("word_correction_threshold");
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  const handleThresholdChange = (value: number) => {
    updateSetting("word_correction_threshold", value);
  };

  return (
    <Slider
      description="Controls how aggressively custom words are applied. Lower values mean fewer corrections will be made, higher values mean more corrections."
      descriptionMode={descriptionMode}
      formatValue={(v) => v.toFixed(2)}
      grouped={grouped}
      label="Correction Threshold"
      max={1.0}
      min={0.0}
      onChange={handleThresholdChange}
      value={wordCorrectionThreshold ?? 0.18}
    />
  );
};

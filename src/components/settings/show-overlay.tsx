import React from "react";
import { Layers } from "lucide-react";
import { NativeSelect, NativeSelectOption } from "../ui/native-select";
import { SettingContainer } from "../ui/SettingContainer";
import { useSettings } from "../../hooks/useSettings";
import type { OverlayPosition } from "../../lib/types";

interface ShowOverlayProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

const overlayOptions = [
  { value: "none", label: "None" },
  { value: "bottom", label: "Bottom" },
  { value: "top", label: "Top" },
];

export const ShowOverlay: React.FC<ShowOverlayProps> = React.memo(({
  descriptionMode = "tooltip",
  grouped = false,
}) => {
  const { getSetting, updateSetting, isUpdating } = useSettings();

  const selectedPosition = (getSetting("overlay_position") ||
    "bottom") as OverlayPosition;

  return (
    <SettingContainer
      title="Overlay Position"
      description="Display visual feedback overlay during recording and transcription"
      descriptionMode={descriptionMode}
      grouped={grouped}
      icon={<Layers className="w-4 h-4" />}
    >
      <NativeSelect
        value={selectedPosition}
        onChange={(e) =>
          updateSetting("overlay_position", e.target.value as OverlayPosition)
        }
        disabled={isUpdating("overlay_position")}
      >
        {overlayOptions.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </SettingContainer>
  );
});

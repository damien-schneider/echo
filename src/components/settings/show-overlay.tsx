import { Layers } from "lucide-react";
import { useSettings } from "../../hooks/use-settings";
import type { OverlayPosition } from "../../lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/Select";
import { SettingContainer } from "../ui/SettingContainer";

interface ShowOverlayProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

const overlayOptions = [
  { value: "none", label: "None" },
  { value: "bottom", label: "Bottom" },
  { value: "top", label: "Top" },
];

export const ShowOverlay = ({
  descriptionMode = "tooltip",
  grouped = false,
}: ShowOverlayProps) => {
  const { getSetting, updateSetting, isUpdating } = useSettings();

  const selectedPosition = (getSetting("overlay_position") ||
    "bottom") as OverlayPosition;

  return (
    <SettingContainer
      description="Display visual feedback overlay during recording and transcription"
      descriptionMode={descriptionMode}
      grouped={grouped}
      icon={<Layers className="h-4 w-4" />}
      title="Overlay Position"
    >
      <Select
        disabled={isUpdating("overlay_position")}
        onValueChange={(val) =>
          updateSetting("overlay_position", val as OverlayPosition)
        }
        value={selectedPosition}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {overlayOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingContainer>
  );
};

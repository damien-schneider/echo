import { Layers } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { SettingContainer } from "@/components/ui/setting-container";
import type { OverlayPosition } from "@/lib/types";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

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
  const selectedPosition = useSetting("overlay_position") || "bottom";
  const updating = useIsSettingUpdating("overlay_position");
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  return (
    <SettingContainer
      description="Display visual feedback overlay during recording and transcription"
      descriptionMode={descriptionMode}
      grouped={grouped}
      icon={<Layers className="h-4 w-4" />}
      title="Overlay Position"
    >
      <Select
        disabled={updating}
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

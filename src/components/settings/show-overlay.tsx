import { Layers } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingContainer } from "@/components/ui/setting-container";
import { type OverlayPosition, OverlayPositionSchema } from "@/lib/types";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

interface ShowOverlayProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

const overlayOptions: ReadonlyArray<{
  label: string;
  value: OverlayPosition;
}> = [
  { label: "Docked edge", value: "edge" },
  { label: "Bottom bar", value: "bottom" },
  { label: "Top bar", value: "top" },
  { label: "Hidden", value: "none" },
];

export const ShowOverlay = ({
  descriptionMode = "tooltip",
  grouped = false,
}: ShowOverlayProps) => {
  const selectedPosition = useSetting("overlay_position") || "edge";
  const updating = useIsSettingUpdating("overlay_position");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const changePosition = (value: string) => {
    const parsed = OverlayPositionSchema.safeParse(value);
    if (parsed.success) {
      updateSetting("overlay_position", parsed.data);
    }
  };

  return (
    <SettingContainer
      description="Dock the control to any screen edge and drag it along the screen border"
      descriptionMode={descriptionMode}
      grouped={grouped}
      icon={<Layers className="h-4 w-4" />}
      title="Overlay"
    >
      <Select
        disabled={updating}
        onValueChange={changePosition}
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

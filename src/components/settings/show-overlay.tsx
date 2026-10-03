import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ctrl-ui/react/ui/select";
import { Layers } from "lucide-react";
import { SettingRow } from "@/features/settings/setting-row";
import { type OverlayPosition, OverlayPositionSchema } from "@/lib/types";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

const overlayOptions: ReadonlyArray<{
  label: string;
  value: OverlayPosition;
}> = [
  { label: "Docked edge", value: "edge" },
  { label: "Bottom bar", value: "bottom" },
  { label: "Top bar", value: "top" },
  { label: "Hidden", value: "none" },
];
export const ShowOverlay = () => {
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
    <SettingRow
      description="Dock the control to any screen edge and drag it along the screen border"
      icon={<Layers className="h-4 w-4" />}
      title="Overlay"
    >
      <Select
        disabled={updating}
        items={overlayOptions}
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
    </SettingRow>
  );
};

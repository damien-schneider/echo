import { Button } from "@ctrl-ui/react/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ctrl-ui/react/ui/select";
import { PlayIcon } from "lucide-react";
import type React from "react";
import { SettingRow } from "@/features/settings/setting-row";
import type { Settings } from "@/lib/types";
import { useSetting, useSettingsStore } from "@/stores/settings-store";

interface SoundPickerProps {
  description: string;
  label: string;
}
export const SoundPicker: React.FC<SoundPickerProps> = ({
  label,
  description,
}) => {
  const soundTheme = useSetting("sound_theme");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const playTestSound = useSettingsStore((s) => s.playTestSound);
  const customSounds = useSettingsStore((s) => s.customSounds);
  const selectedTheme = soundTheme ?? "marimba";
  const hasCustomSounds = customSounds.start && customSounds.stop;
  const soundOptions = [
    { value: "marimba", label: "Marimba" },
    { value: "pop", label: "Pop" },
    ...(hasCustomSounds ? [{ value: "custom" as const, label: "Custom" }] : []),
  ] satisfies { value: Settings["sound_theme"]; label: string }[];
  const handlePlayBothSounds = async () => {
    await playTestSound("start");
    await playTestSound("stop");
  };
  return (
    <SettingRow description={description} layout="horizontal" title={label}>
      <div className="flex items-center gap-2">
        <Select
          items={soundOptions}
          onValueChange={(val: Settings["sound_theme"]) =>
            updateSetting("sound_theme", val)
          }
          value={selectedTheme}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {soundOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          aria-label="Preview sound theme"
          onClick={handlePlayBothSounds}
          size="sm"
          title="Preview sound theme (plays start then stop)"
          variant="ghost"
        >
          <PlayIcon className="h-4 w-4" />
        </Button>
      </div>
    </SettingRow>
  );
};

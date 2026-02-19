import { PlayIcon } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { SettingContainer } from "@/components/ui/setting-container";
import type { Settings } from "@/lib/types";
import { useSetting, useSettingsStore } from "@/stores/settings-store";

interface SoundPickerProps {
  label: string;
  description: string;
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

  const handlePlayBothSounds = async () => {
    await playTestSound("start");
    await playTestSound("stop");
  };

  return (
    <SettingContainer
      description={description}
      grouped
      layout="horizontal"
      title={label}
    >
      <div className="flex items-center gap-2">
        <Select
          onValueChange={(val: Settings["sound_theme"]) =>
            updateSetting("sound_theme", val)
          }
          value={selectedTheme}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="marimba">Marimba</SelectItem>
            <SelectItem value="pop">Pop</SelectItem>
            {hasCustomSounds && <SelectItem value="custom">Custom</SelectItem>}
          </SelectContent>
        </Select>
        <Button
          onClick={handlePlayBothSounds}
          size="sm"
          title="Preview sound theme (plays start then stop)"
          variant="ghost"
        >
          <PlayIcon className="h-4 w-4" />
        </Button>
      </div>
    </SettingContainer>
  );
};

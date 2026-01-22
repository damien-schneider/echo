import { PlayIcon } from "lucide-react";
import type React from "react";
import { useSettings } from "../../hooks/use-settings";
import { Button } from "../ui/Button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/Select";
import { SettingContainer } from "../ui/SettingContainer";

interface SoundPickerProps {
  label: string;
  description: string;
}

export const SoundPicker: React.FC<SoundPickerProps> = ({
  label,
  description,
}) => {
  const { getSetting, updateSetting, playTestSound, customSounds } =
    useSettings();

  const selectedTheme = getSetting("sound_theme") ?? "marimba";

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
          onValueChange={(val) =>
            updateSetting("sound_theme", val as "marimba" | "pop" | "custom")
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

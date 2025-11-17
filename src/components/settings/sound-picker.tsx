import React from "react";
import { Button } from "../ui/Button";
import { NativeSelect, NativeSelectOption } from "../ui/native-select";
import { PlayIcon } from "lucide-react";
import { SettingContainer } from "../ui/SettingContainer";
import { useSettingsStore } from "../../stores/settings-store";
import { useSettings } from "../../hooks/useSettings";

interface SoundPickerProps {
  label: string;
  description: string;
}

export const SoundPicker: React.FC<SoundPickerProps> = ({
  label,
  description,
}) => {
  const { getSetting, updateSetting } = useSettings();
  const playTestSound = useSettingsStore((state) => state.playTestSound);
  const customSounds = useSettingsStore((state) => state.customSounds);

  const selectedTheme = getSetting("sound_theme") ?? "marimba";

  const hasCustomSounds = customSounds.start && customSounds.stop;

  const handlePlayBothSounds = async () => {
    await playTestSound("start");
    // Wait before playing stop sound
    await new Promise((resolve) => setTimeout(resolve, 800));
    await playTestSound("stop");
  };

  return (
    <SettingContainer
      title={label}
      description={description}
      grouped
      layout="horizontal"
    >
      <div className="flex items-center gap-2">
        <NativeSelect
          value={selectedTheme}
          onChange={(e) =>
            updateSetting("sound_theme", e.target.value as "marimba" | "pop" | "custom")
          }
        >
          <NativeSelectOption value="marimba">Marimba</NativeSelectOption>
          <NativeSelectOption value="pop">Pop</NativeSelectOption>
          {hasCustomSounds && (
            <NativeSelectOption value="custom">Custom</NativeSelectOption>
          )}
        </NativeSelect>
        <Button
          variant="ghost"
          size="sm"
          onClick={handlePlayBothSounds}
          title="Preview sound theme (plays start then stop)"
        >
          <PlayIcon className="h-4 w-4" />
        </Button>
      </div>
    </SettingContainer>
  );
};

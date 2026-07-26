import { Languages } from "lucide-react";
import { SettingContainer } from "@/components/ui/setting-container";
import { Switch } from "@/components/ui/switch";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

interface TranslateToEnglishProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const TranslateToEnglish = ({
  descriptionMode = "tooltip",
  grouped = false,
}: TranslateToEnglishProps) => {
  const translateToEnglish = useSetting("translate_to_english");
  const updating = useIsSettingUpdating("translate_to_english");
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  return (
    <SettingContainer
      description="Automatically translate speech from other languages to English during transcription."
      descriptionMode={descriptionMode}
      grouped={grouped}
      icon={<Languages className="h-4 w-4" />}
      title="Translate to English"
    >
      <Switch
        checked={translateToEnglish}
        disabled={updating}
        onCheckedChange={(enabled) =>
          updateSetting("translate_to_english", enabled)
        }
      />
    </SettingContainer>
  );
};

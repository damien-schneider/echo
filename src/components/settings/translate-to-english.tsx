import { Switch } from "@ctrl-ui/react/ui/switch";
import { Languages } from "lucide-react";
import { SettingRow } from "@/features/settings/setting-row";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";
export const TranslateToEnglish = () => {
  const translateToEnglish = useSetting("translate_to_english");
  const updating = useIsSettingUpdating("translate_to_english");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  return (
    <SettingRow
      description="Automatically translate speech from other languages to English during transcription."
      icon={<Languages className="h-4 w-4" />}
      title="Translate to English"
    >
      <Switch
        checked={translateToEnglish === true}
        disabled={updating || translateToEnglish === undefined}
        onCheckedChange={(enabled) =>
          updateSetting("translate_to_english", enabled)
        }
      />
    </SettingRow>
  );
};

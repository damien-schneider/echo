import { Switch } from "@ctrl-ui/react/ui/switch";
import { Bell } from "lucide-react";
import type React from "react";
import { SettingRow } from "@/features/settings/setting-row";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";
export const AudioFeedback: React.FC = () => {
  const audioFeedbackEnabled = useSetting("audio_feedback");
  const updating = useIsSettingUpdating("audio_feedback");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  return (
    <div className="flex flex-col">
      <SettingRow
        description="Play sound when recording starts and stops"
        icon={<Bell className="h-4 w-4" />}
        title="Audio Feedback"
      >
        <Switch
          checked={audioFeedbackEnabled === true}
          disabled={updating || audioFeedbackEnabled === undefined}
          onCheckedChange={(enabled) =>
            updateSetting("audio_feedback", enabled)
          }
        />
      </SettingRow>
    </div>
  );
};

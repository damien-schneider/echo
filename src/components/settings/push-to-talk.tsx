import { Switch } from "@ctrl-ui/react/ui/switch";
import { Hand } from "lucide-react";
import { SettingRow } from "@/features/settings/setting-row";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";
export const PushToTalk = () => {
  const pttEnabled = useSetting("push_to_talk");
  const updating = useIsSettingUpdating("push_to_talk");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  return (
    <SettingRow
      description="Hold the shortcut to record; release to stop."
      icon={<Hand className="h-4 w-4" />}
      title="Push to talk"
    >
      <Switch
        checked={pttEnabled === true}
        disabled={updating || pttEnabled === undefined}
        onCheckedChange={(enabled) => updateSetting("push_to_talk", enabled)}
      />
    </SettingRow>
  );
};

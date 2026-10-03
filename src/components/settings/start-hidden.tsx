import { Switch } from "@ctrl-ui/react/ui/switch";
import { EyeOff } from "lucide-react";
import { SettingRow } from "@/features/settings/setting-row";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";
export const StartHidden = () => {
  const startHidden = useSetting("start_hidden") ?? false;
  const updating = useIsSettingUpdating("start_hidden");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  return (
    <SettingRow
      description="Keep the window closed when Echo starts."
      icon={<EyeOff className="h-4 w-4" />}
      title="Start hidden"
    >
      <Switch
        checked={startHidden}
        disabled={updating}
        onCheckedChange={(enabled) => updateSetting("start_hidden", enabled)}
      />
    </SettingRow>
  );
};

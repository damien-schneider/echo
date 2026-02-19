import { EyeOff } from "lucide-react";
import { SettingContainer } from "@/components/ui/setting-container";
import { Switch } from "@/components/ui/switch";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

interface StartHiddenProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const StartHidden = ({
  descriptionMode = "tooltip",
  grouped = false,
}: StartHiddenProps) => {
  const startHidden = useSetting("start_hidden") ?? false;
  const updating = useIsSettingUpdating("start_hidden");
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  return (
    <SettingContainer
      description="Launch to system tray without opening the window."
      descriptionMode={descriptionMode}
      grouped={grouped}
      icon={<EyeOff className="h-4 w-4" />}
      title="Start Hidden"
      tooltipPosition="bottom"
    >
      <Switch
        checked={startHidden}
        disabled={updating}
        onCheckedChange={(enabled) => updateSetting("start_hidden", enabled)}
      />
    </SettingContainer>
  );
};

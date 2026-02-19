import { Keyboard } from "lucide-react";
import { SettingContainer } from "@/components/ui/setting-container";
import { Switch } from "@/components/ui/switch";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

interface InputTrackingToggleProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const InputTrackingToggle = ({
  descriptionMode = "tooltip",
  grouped = false,
}: InputTrackingToggleProps) => {
  const inputTrackingEnabled = useSetting("input_tracking_enabled") ?? false;
  const updating = useIsSettingUpdating("input_tracking_enabled");
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  return (
    <SettingContainer
      description="Track text typed in any application. Entries are saved when switching apps, clicking, or after idle timeout. Requires accessibility permissions."
      descriptionMode={descriptionMode}
      grouped={grouped}
      icon={<Keyboard className="h-4 w-4" />}
      title="Enable Input Tracking"
    >
      <Switch
        checked={inputTrackingEnabled}
        disabled={updating}
        onCheckedChange={(enabled) =>
          updateSetting("input_tracking_enabled", enabled)
        }
      />
    </SettingContainer>
  );
};

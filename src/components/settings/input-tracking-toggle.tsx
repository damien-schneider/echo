import { Keyboard } from "lucide-react";
import { SettingContainer } from "@/components/ui/SettingContainer";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/hooks/use-settings";

type InputTrackingToggleProps = {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
};

export const InputTrackingToggle = ({
  descriptionMode = "tooltip",
  grouped = false,
}: InputTrackingToggleProps) => {
  const { getSetting, updateSetting, isUpdating } = useSettings();

  const inputTrackingEnabled = getSetting("input_tracking_enabled") ?? false;

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
        disabled={isUpdating("input_tracking_enabled")}
        onCheckedChange={(enabled) =>
          updateSetting("input_tracking_enabled", enabled)
        }
      />
    </SettingContainer>
  );
};

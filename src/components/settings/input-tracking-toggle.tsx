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
      description="Track text typed in any application and receive a notification when you leave an input field. Requires accessibility permissions."
      descriptionMode={descriptionMode}
      grouped={grouped}
      icon={<Keyboard className="h-4 w-4" />}
      title="Input Tracking Notifications"
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

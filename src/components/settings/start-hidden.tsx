import React from "react";
import { EyeOff } from "lucide-react";
import { Switch } from "../ui/switch";
import { SettingContainer } from "../ui/SettingContainer";
import { useSettings } from "../../hooks/useSettings";

interface StartHiddenProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const StartHidden: React.FC<StartHiddenProps> = React.memo(({ 
  descriptionMode = "tooltip",
  grouped = false,
}) => {
  const { getSetting, updateSetting, isUpdating } = useSettings();

  const startHidden = getSetting("start_hidden") ?? false;

  return (
    <SettingContainer
      title="Start Hidden"
      description="Launch to system tray without opening the window."
      descriptionMode={descriptionMode}
      grouped={grouped}
      tooltipPosition="bottom"
      icon={<EyeOff className="w-4 h-4" />}
    >
      <Switch
        checked={startHidden}
        onCheckedChange={(enabled) => updateSetting("start_hidden", enabled)}
        disabled={isUpdating("start_hidden")}
      />
    </SettingContainer>
  );
});

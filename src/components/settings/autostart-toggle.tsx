import React from "react";
import { PlayCircle } from "lucide-react";
import { Switch } from "../ui/switch";
import { SettingContainer } from "../ui/SettingContainer";
import { useSettings } from "../../hooks/useSettings";

interface AutostartToggleProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const AutostartToggle: React.FC<AutostartToggleProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { getSetting, updateSetting, isUpdating } = useSettings();

    const autostartEnabled = getSetting("autostart_enabled") ?? false;

    return (
      <SettingContainer
        title="Launch on Startup"
        description="Automatically start Echo when you log in to your computer."
        descriptionMode={descriptionMode}
        grouped={grouped}
        icon={<PlayCircle className="w-4 h-4" />}
      >
        <Switch
          checked={autostartEnabled}
          onCheckedChange={(enabled) => updateSetting("autostart_enabled", enabled)}
          disabled={isUpdating("autostart_enabled")}
        />
      </SettingContainer>
    );
  },
);

import { PlayCircle } from "lucide-react";
import { SettingContainer } from "@/components/ui/setting-container";
import { Switch } from "@/components/ui/switch";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

interface AutostartToggleProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const AutostartToggle = ({
  descriptionMode = "tooltip",
  grouped = false,
}: AutostartToggleProps) => {
  const autostartEnabled = useSetting("autostart_enabled") ?? false;
  const updating = useIsSettingUpdating("autostart_enabled");
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  return (
    <SettingContainer
      description="Automatically start Echo when you log in to your computer."
      descriptionMode={descriptionMode}
      grouped={grouped}
      icon={<PlayCircle className="h-4 w-4" />}
      title="Launch on Startup"
    >
      <Switch
        checked={autostartEnabled}
        disabled={updating}
        onCheckedChange={(enabled) =>
          updateSetting("autostart_enabled", enabled)
        }
      />
    </SettingContainer>
  );
};

import React from "react";
import { Hand } from "lucide-react";
import { Switch } from "../ui/switch";
import { SettingContainer } from "../ui/SettingContainer";
import { useSettings } from "../../hooks/useSettings";

interface PushToTalkProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const PushToTalk: React.FC<PushToTalkProps> = React.memo(({
  descriptionMode = "tooltip",
  grouped = false,
}) => {
  const { getSetting, updateSetting, isUpdating } = useSettings();

  const pttEnabled = getSetting("push_to_talk") || false;

  return (
    <SettingContainer
      title="Push To Talk"
      description="Hold to record, release to stop"
      descriptionMode={descriptionMode}
      grouped={grouped}
      icon={<Hand className="w-4 h-4" />}
    >
      <Switch
        checked={pttEnabled}
        onCheckedChange={(enabled) => updateSetting("push_to_talk", enabled)}
        disabled={isUpdating("push_to_talk")}
      />
    </SettingContainer>
  );
});

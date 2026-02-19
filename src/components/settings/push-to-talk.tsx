import { Hand } from "lucide-react";
import { SettingContainer } from "@/components/ui/setting-container";
import { Switch } from "@/components/ui/switch";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

interface PushToTalkProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const PushToTalk = ({
  descriptionMode = "tooltip",
  grouped = false,
}: PushToTalkProps) => {
  const pttEnabled = useSetting("push_to_talk");
  const updating = useIsSettingUpdating("push_to_talk");
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  return (
    <SettingContainer
      description="Hold to record, release to stop"
      descriptionMode={descriptionMode}
      grouped={grouped}
      icon={<Hand className="h-4 w-4" />}
      title="Push To Talk"
    >
      <Switch
        checked={pttEnabled}
        disabled={updating}
        onCheckedChange={(enabled) => updateSetting("push_to_talk", enabled)}
      />
    </SettingContainer>
  );
};

import type React from "react";
import { SettingContainer } from "@/components/ui/SettingContainer";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/hooks/use-settings";

type AiSdkToolsToggleProps = {
  grouped?: boolean;
  descriptionMode?: "inline" | "tooltip";
};

export const AiSdkToolsToggle: React.FC<AiSdkToolsToggleProps> = ({
  grouped = false,
  descriptionMode = "tooltip",
}) => {
  const { getSetting, updateSetting, isUpdating } = useSettings();
  const aiSdkToolsEnabled = getSetting("ai_sdk_tools_enabled") ?? false;
  const betaEnabled = getSetting("beta_features_enabled") ?? false;

  return (
    <SettingContainer
      description="Enable AI SDK tools to allow voice commands to execute actions like opening terminal, running commands, or opening files. Requires Beta Features to be enabled."
      descriptionMode={descriptionMode}
      grouped={grouped}
      title="AI SDK Tools"
    >
      <Switch
        checked={aiSdkToolsEnabled}
        disabled={!betaEnabled || isUpdating("ai_sdk_tools_enabled")}
        onCheckedChange={(value) =>
          updateSetting("ai_sdk_tools_enabled", value)
        }
      />
    </SettingContainer>
  );
};

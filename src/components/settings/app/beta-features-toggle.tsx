import type React from "react";
import { SettingContainer } from "@/components/ui/SettingContainer";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/hooks/use-settings";

type BetaFeaturesToggleProps = {
  grouped?: boolean;
  descriptionMode?: "inline" | "tooltip";
};

export const BetaFeaturesToggle: React.FC<BetaFeaturesToggleProps> = ({
  grouped = false,
  descriptionMode = "inline",
}) => {
  const { getSetting, updateSetting, isUpdating } = useSettings();
  const betaEnabled = getSetting("beta_features_enabled") ?? false;

  return (
    <SettingContainer
      description="Unlock experimental capabilities like LLM post-processing. Expect rough edges and provide feedback."
      descriptionMode={descriptionMode}
      grouped={grouped}
      title="Enable Beta Features"
    >
      <Switch
        checked={betaEnabled}
        disabled={isUpdating("beta_features_enabled")}
        onCheckedChange={(value) =>
          updateSetting("beta_features_enabled", value)
        }
      />
    </SettingContainer>
  );
};

import React from "react";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { SettingContainer } from "../../ui/SettingContainer";
import { Switch } from "../../ui/switch";
import { useSettings } from "../../../hooks/useSettings";

export const ExperimentsSettings: React.FC = () => {
  const { getSetting, updateSetting, isUpdating } = useSettings();

  const betaEnabled = getSetting("beta_features_enabled") ?? false;
  const debugLoggingEnabled = getSetting("debug_logging_enabled") ?? false;

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup title="Experiments">
        <SettingContainer
          title="Enable Beta Features"
          description="Unlock experimental capabilities like LLM post-processing. Expect rough edges and provide feedback."
          descriptionMode="tooltip"
          grouped={true}
        >
          <Switch
            checked={betaEnabled}
            onCheckedChange={(value) => updateSetting("beta_features_enabled", value)}
            disabled={isUpdating("beta_features_enabled")}
          />
        </SettingContainer>

        <SettingContainer
          title="Enable Debug Logging"
          description="Increase backend log verbosity to help diagnose issues. Logs remain local but may include sensitive snippets."
          descriptionMode="tooltip"
          grouped={true}
        >
          <Switch
            checked={debugLoggingEnabled}
            onCheckedChange={(value) => updateSetting("debug_logging_enabled", value)}
            disabled={isUpdating("debug_logging_enabled")}
          />
        </SettingContainer>
      </SettingsGroup>
    </div>
  );
};

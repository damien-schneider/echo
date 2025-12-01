import type React from "react";
import { useSettings } from "../../../hooks/use-settings";
import { SettingContainer } from "../../ui/SettingContainer";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { Switch } from "../../ui/switch";
import { InputTrackingExcludedApps } from "../input-tracking-excluded-apps";
import { InputTrackingToggle } from "../input-tracking-toggle";

export const ExperimentsSettings: React.FC = () => {
  const { getSetting, updateSetting, isUpdating } = useSettings();

  const betaEnabled = getSetting("beta_features_enabled") ?? false;
  const debugLoggingEnabled = getSetting("debug_logging_enabled") ?? false;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <SettingsGroup title="Experiments">
        <SettingContainer
          description="Unlock experimental capabilities like LLM post-processing. Expect rough edges and provide feedback."
          descriptionMode="tooltip"
          grouped={true}
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

        <SettingContainer
          description="Increase backend log verbosity to help diagnose issues. Logs remain local but may include sensitive snippets."
          descriptionMode="tooltip"
          grouped={true}
          title="Enable Debug Logging"
        >
          <Switch
            checked={debugLoggingEnabled}
            disabled={isUpdating("debug_logging_enabled")}
            onCheckedChange={(value) =>
              updateSetting("debug_logging_enabled", value)
            }
          />
        </SettingContainer>

        <InputTrackingToggle descriptionMode="tooltip" grouped={true} />

        <InputTrackingExcludedApps grouped={true} />
      </SettingsGroup>
    </div>
  );
};

import { InputTrackingExcludedApps } from "@/components/settings/input-tracking-excluded-apps";
import { InputTrackingIdleTimeout } from "@/components/settings/input-tracking-idle-timeout";
import { InputTrackingToggle } from "@/components/settings/input-tracking-toggle";
import { SettingsSection } from "@/features/settings/settings-section";
import { useSetting } from "@/stores/settings-store";
export const KeyboardTrackingSettings = () => {
  const inputTrackingEnabled = useSetting("input_tracking_enabled") ?? false;
  return (
    <div className="space-y-5">
      <SettingsSection defaultOpen={true} title="Keyboard tracking">
        <InputTrackingToggle />
        {inputTrackingEnabled && (
          <>
            <InputTrackingIdleTimeout />
            <InputTrackingExcludedApps />
          </>
        )}
      </SettingsSection>
    </div>
  );
};

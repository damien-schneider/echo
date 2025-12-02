import { invoke } from "@tauri-apps/api/core";
import { Clock } from "lucide-react";
import type React from "react";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { SettingContainer } from "@/components/ui/SettingContainer";
import { useSettings } from "@/hooks/use-settings";

type InputTrackingIdleTimeoutProps = {
  descriptionMode?: "tooltip" | "inline";
  grouped?: boolean;
};

const timeoutOptions = [
  { value: "0", label: "Disabled (app switch/click only)" },
  { value: "2", label: "2 seconds" },
  { value: "5", label: "5 seconds" },
  { value: "10", label: "10 seconds" },
];

export const InputTrackingIdleTimeout: React.FC<
  InputTrackingIdleTimeoutProps
> = ({ descriptionMode = "tooltip", grouped = false }) => {
  const { getSetting, updateSetting } = useSettings();

  const handleChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    const newTimeout = value === "0" ? null : Number(value);

    try {
      await invoke("change_input_tracking_idle_timeout", {
        timeoutSecs: newTimeout,
      });
      updateSetting("input_tracking_idle_timeout", newTimeout);
    } catch (error) {
      console.error("Failed to update input tracking idle timeout:", error);
    }
  };

  const currentValue = getSetting("input_tracking_idle_timeout");
  // Convert null/undefined/0 to "0" string, otherwise use the number as string
  const selectValue =
    currentValue === null || currentValue === undefined || currentValue === 0
      ? "0"
      : String(currentValue);

  return (
    <SettingContainer
      description="Save input entries after being idle for this duration. Set to disabled to only save on app switch or click."
      descriptionMode={descriptionMode}
      grouped={grouped}
      icon={<Clock className="h-4 w-4" />}
      title="Idle Timeout"
    >
      <NativeSelect onChange={handleChange} value={selectValue}>
        {timeoutOptions.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </SettingContainer>
  );
};

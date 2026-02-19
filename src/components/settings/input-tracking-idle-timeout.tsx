import { invoke } from "@tauri-apps/api/core";
import { Clock } from "lucide-react";
import type React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { SettingContainer } from "@/components/ui/setting-container";
import { useSetting, useSettingsStore } from "@/stores/settings-store";

interface InputTrackingIdleTimeoutProps {
  descriptionMode?: "tooltip" | "inline";
  grouped?: boolean;
}

const timeoutOptions = [
  { value: "0", label: "Disabled (app switch/click only)" },
  { value: "2", label: "2 seconds" },
  { value: "5", label: "5 seconds" },
  { value: "10", label: "10 seconds" },
];

export const InputTrackingIdleTimeout: React.FC<
  InputTrackingIdleTimeoutProps
> = ({ descriptionMode = "tooltip", grouped = false }) => {
  const currentValue = useSetting("input_tracking_idle_timeout");
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  const handleChange = async (value: string) => {
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
      <Select onValueChange={handleChange} value={selectValue}>
        <SelectTrigger className="w-[200px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {timeoutOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingContainer>
  );
};

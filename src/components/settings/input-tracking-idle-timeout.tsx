import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ctrl-ui/react/ui/select";
import { invoke } from "@tauri-apps/api/core";
import { Clock } from "lucide-react";
import type React from "react";
import { SettingRow } from "@/features/settings/setting-row";
import { useSetting, useSettingsStore } from "@/stores/settings-store";

const timeoutOptions = [
  { label: "Disabled (app switch/click only)", value: "0" },
  { label: "2 seconds", value: "2" },
  { label: "5 seconds", value: "5" },
  { label: "10 seconds", value: "10" },
];
export const InputTrackingIdleTimeout: React.FC = () => {
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
  const selectValue =
    currentValue === null || currentValue === undefined || currentValue === 0
      ? "0"
      : String(currentValue);
  return (
    <SettingRow
      description="Save input entries after being idle for this duration. Set to disabled to only save on app switch or click."
      icon={<Clock className="h-4 w-4" />}
      title="Idle Timeout"
    >
      <Select
        items={timeoutOptions}
        onValueChange={handleChange}
        value={selectValue}
      >
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
    </SettingRow>
  );
};

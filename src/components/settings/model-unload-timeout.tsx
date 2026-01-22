import { invoke } from "@tauri-apps/api/core";
import { Timer } from "lucide-react";
import type React from "react";
import { useSettings } from "../../hooks/use-settings";
import type { ModelUnloadTimeout } from "../../lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/Select";
import { SettingContainer } from "../ui/SettingContainer";

interface ModelUnloadTimeoutProps {
  descriptionMode?: "tooltip" | "inline";
  grouped?: boolean;
}

const timeoutOptions = [
  { value: "never" as ModelUnloadTimeout, label: "Never" },
  { value: "immediately" as ModelUnloadTimeout, label: "Immediately" },
  { value: "min2" as ModelUnloadTimeout, label: "After 2 minutes" },
  { value: "min5" as ModelUnloadTimeout, label: "After 5 minutes" },
  { value: "min10" as ModelUnloadTimeout, label: "After 10 minutes" },
  { value: "min15" as ModelUnloadTimeout, label: "After 15 minutes" },
  { value: "hour1" as ModelUnloadTimeout, label: "After 1 hour" },
];

const debugTimeoutOptions = [
  ...timeoutOptions,
  { value: "sec5" as ModelUnloadTimeout, label: "After 5 seconds (Debug)" },
];

export const ModelUnloadTimeoutSetting: React.FC<ModelUnloadTimeoutProps> = ({
  descriptionMode = "inline",
  grouped = false,
}) => {
  const { settings, getSetting, updateSetting } = useSettings();

  const handleChange = async (value: string) => {
    const newTimeout = value as ModelUnloadTimeout;

    try {
      await invoke("set_model_unload_timeout", { timeout: newTimeout });
      updateSetting("model_unload_timeout", newTimeout);
    } catch (error) {
      console.error("Failed to update model unload timeout:", error);
    }
  };

  const currentValue = getSetting("model_unload_timeout") ?? "never";

  const options =
    settings?.debug_mode === true ? debugTimeoutOptions : timeoutOptions;

  return (
    <SettingContainer
      description="Automatically free GPU/CPU memory when the model hasn't been used for the specified time"
      descriptionMode={descriptionMode}
      grouped={grouped}
      icon={<Timer className="h-4 w-4" />}
      title="Unload Model"
    >
      <Select
        disabled={false}
        onValueChange={handleChange}
        value={currentValue}
      >
        <SelectTrigger className="w-full md:w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingContainer>
  );
};

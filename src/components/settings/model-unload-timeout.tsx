import { invoke } from "@tauri-apps/api/core";
import { Timer } from "lucide-react";
import type React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { SettingContainer } from "@/components/ui/setting-container";
import type { ModelUnloadTimeout } from "@/lib/types";
import { useSetting, useSettingsStore } from "@/stores/settings-store";

interface ModelUnloadTimeoutProps {
  descriptionMode?: "tooltip" | "inline";
  grouped?: boolean;
}

const timeoutOptions: { value: ModelUnloadTimeout; label: string }[] = [
  { value: "never", label: "Never" },
  { value: "immediately", label: "Immediately" },
  { value: "min2", label: "After 2 minutes" },
  { value: "min5", label: "After 5 minutes" },
  { value: "min10", label: "After 10 minutes" },
  { value: "min15", label: "After 15 minutes" },
  { value: "hour1", label: "After 1 hour" },
];

const debugTimeoutOptions: { value: ModelUnloadTimeout; label: string }[] = [
  ...timeoutOptions,
  { value: "sec5", label: "After 5 seconds (Debug)" },
];

export const ModelUnloadTimeoutSetting: React.FC<ModelUnloadTimeoutProps> = ({
  descriptionMode = "inline",
  grouped = false,
}) => {
  const modelUnloadTimeout = useSetting("model_unload_timeout");
  const debugMode = useSetting("debug_mode");
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  const handleChange = async (value: string) => {
    const newTimeout = value as ModelUnloadTimeout;

    try {
      await invoke("set_model_unload_timeout", { timeout: newTimeout });
      updateSetting("model_unload_timeout", newTimeout);
    } catch (error) {
      console.error("Failed to update model unload timeout:", error);
    }
  };

  const currentValue = modelUnloadTimeout ?? "never";

  const options = debugMode === true ? debugTimeoutOptions : timeoutOptions;

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

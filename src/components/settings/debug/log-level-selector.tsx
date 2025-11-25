import React from "react";
import { SettingContainer } from "@/components/ui/SettingContainer";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useSettings } from "@/hooks/use-settings";

const LOG_LEVEL_OPTIONS = [
  { value: "1", label: "Error" },
  { value: "2", label: "Warn" },
  { value: "3", label: "Info" },
  { value: "4", label: "Debug" },
  { value: "5", label: "Trace" },
];

interface LogLevelSelectorProps {
  descriptionMode?: "tooltip" | "inline";
  grouped?: boolean;
}

export const LogLevelSelector: React.FC<LogLevelSelectorProps> = ({
  descriptionMode = "tooltip",
  grouped = false,
}) => {
  const { settings, updateSetting, isUpdating } = useSettings();
  const currentLevel = settings?.log_level ?? 2;
  const isLevelUpdating = isUpdating("log_level");

  const selectedValue = currentLevel.toString();

  const handleSelect = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const parsed = Number.parseInt(event.target.value, 10);
    if (Number.isNaN(parsed) || parsed === currentLevel) return;
    try {
      await updateSetting("log_level", parsed as unknown as number);
    } catch (error) {
      console.error("Failed to update log level:", error);
    }
  };

  return (
    <SettingContainer
      title="Log Level"
      description="Choose how verbose Handy should be while logging to disk"
      descriptionMode={descriptionMode}
      grouped={grouped}
      layout="horizontal"
    >
      <div className="space-y-1">
        <NativeSelect
          value={selectedValue}
          onChange={handleSelect}
          disabled={!settings || isLevelUpdating}
        >
          {LOG_LEVEL_OPTIONS.map((opt) => (
            <NativeSelectOption key={opt.value} value={opt.value}>
              {opt.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
    </SettingContainer>
  );
};

import React from "react";
import { useSettings } from "../../hooks/use-settings";
import { RecordingRetentionPeriod } from "../../lib/types";
import { SettingContainer } from "../ui/SettingContainer";
import { NativeSelect, NativeSelectOption } from "../ui/native-select";

interface RecordingRetentionPeriodProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const RecordingRetentionPeriodSelector = ({ descriptionMode = "tooltip", grouped = false }: RecordingRetentionPeriodProps) => {
    const { getSetting, updateSetting, isUpdating } = useSettings();

    const selectedRetentionPeriod =
      (getSetting("recording_retention_period") as RecordingRetentionPeriod | undefined) ||
      "preserve_limit";
    const historyLimit = getSetting("history_limit") ?? 5;

    const retentionOptions: { value: RecordingRetentionPeriod; label: string }[] = [
      { value: "never", label: "Never" },
      {
        value: "preserve_limit",
        label: `Preserve ${historyLimit} Recording${historyLimit === 1 ? "" : "s"}`,
      },
      { value: "days3", label: "After 3 Days" },
      { value: "weeks2", label: "After 2 Weeks" },
      { value: "months3", label: "After 3 Months" },
    ];

    const handleRetentionPeriodSelect = async (period: RecordingRetentionPeriod) => {
      await updateSetting("recording_retention_period", period);
    };

    return (
      <SettingContainer
        title="Delete Recordings"
        description="Automatically delete recordings from the device"
        descriptionMode={descriptionMode}
        grouped={grouped}
      >
        <NativeSelect
          value={selectedRetentionPeriod}
          onChange={(e) => handleRetentionPeriodSelect(e.target.value as RecordingRetentionPeriod)}
          disabled={isUpdating("recording_retention_period")}
          className="w-full md:w-72"
        >
          {retentionOptions.map((option) => (
            <NativeSelectOption key={option.value} value={option.value}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </SettingContainer>
    );
};

RecordingRetentionPeriodSelector.displayName = "RecordingRetentionPeriodSelector";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ctrl-ui/react/ui/select";
import { SettingRow } from "@/features/settings/setting-row";
import type { RecordingRetentionPeriod } from "@/lib/types";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";
export const RecordingRetentionPeriodSelector = () => {
  const selectedRetentionPeriod =
    useSetting("recording_retention_period") || "preserve_limit";
  const historyLimit = useSetting("history_limit") ?? 5;
  const updating = useIsSettingUpdating("recording_retention_period");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const retentionOptions: {
    value: RecordingRetentionPeriod;
    label: string;
  }[] = [
    { label: "Never", value: "never" },
    {
      label: `Preserve ${historyLimit} Recording${historyLimit === 1 ? "" : "s"}`,
      value: "preserve_limit",
    },
    { label: "After 3 Days", value: "days3" },
    { label: "After 2 Weeks", value: "weeks2" },
    { label: "After 3 Months", value: "months3" },
  ];
  const handleRetentionPeriodSelect = async (
    period: RecordingRetentionPeriod
  ) => {
    await updateSetting("recording_retention_period", period);
  };
  return (
    <SettingRow
      description="Automatically delete recordings from the device"
      title="Delete Recordings"
    >
      <Select<RecordingRetentionPeriod>
        disabled={updating}
        items={retentionOptions}
        onValueChange={(val) => handleRetentionPeriodSelect(val)}
        value={selectedRetentionPeriod}
      >
        <SelectTrigger className="w-full md:w-72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {retentionOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingRow>
  );
};
RecordingRetentionPeriodSelector.displayName =
  "RecordingRetentionPeriodSelector";

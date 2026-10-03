import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldIncrement,
  NumberFieldInput,
} from "@ctrl-ui/react/ui/number-field";
import { SettingRow } from "@/features/settings/setting-row";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

export function HistoryLimit() {
  const historyLimit = useSetting("history_limit") ?? 5;
  const updating = useIsSettingUpdating("history_limit");
  const updateSetting = useSettingsStore((store) => store.updateSetting);

  return (
    <SettingRow
      description="Maximum number of transcription entries to keep in history"
      title="History Limit"
    >
      <NumberField
        className="w-32"
        disabled={updating}
        max={1000}
        min={0}
        onValueChange={(limit) => {
          if (limit !== null) {
            updateSetting("history_limit", limit);
          }
        }}
        value={historyLimit}
      >
        <NumberFieldDecrement aria-label="Keep fewer history entries" />
        <NumberFieldInput />
        <NumberFieldIncrement aria-label="Keep more history entries" />
      </NumberField>
    </SettingRow>
  );
}

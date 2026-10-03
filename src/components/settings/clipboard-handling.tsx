import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ctrl-ui/react/ui/select";
import { ClipboardCopy } from "lucide-react";
import { SettingRow } from "@/features/settings/setting-row";
import type { ClipboardHandling } from "@/lib/types";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

const clipboardHandlingOptions = [
  { label: "Don't Modify Clipboard", value: "dont_modify" },
  { label: "Copy to Clipboard", value: "copy_to_clipboard" },
] satisfies { value: ClipboardHandling; label: string }[];
export const ClipboardHandlingSetting = () => {
  const selectedHandling = useSetting("clipboard_handling") || "dont_modify";
  const updating = useIsSettingUpdating("clipboard_handling");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  return (
    <SettingRow
      description="Don't Modify Clipboard preserves your current clipboard contents after transcription. Copy to Clipboard leaves the transcription result in your clipboard after pasting."
      icon={<ClipboardCopy className="h-4 w-4" />}
      title="Clipboard Handling"
    >
      <Select<ClipboardHandling>
        disabled={updating}
        items={clipboardHandlingOptions}
        onValueChange={(val) => updateSetting("clipboard_handling", val)}
        value={selectedHandling}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {clipboardHandlingOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingRow>
  );
};

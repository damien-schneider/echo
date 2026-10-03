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
  { label: "Keep existing content", value: "dont_modify" },
  { label: "Keep transcription", value: "copy_to_clipboard" },
] satisfies { value: ClipboardHandling; label: string }[];
export const ClipboardHandlingSetting = () => {
  const selectedHandling = useSetting("clipboard_handling") || "dont_modify";
  const updating = useIsSettingUpdating("clipboard_handling");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  return (
    <SettingRow
      description="Choose what stays on the clipboard after pasting."
      icon={<ClipboardCopy className="h-4 w-4" />}
      title="Clipboard"
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

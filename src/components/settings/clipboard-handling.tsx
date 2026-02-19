import { ClipboardCopy } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { SettingContainer } from "@/components/ui/setting-container";
import type { ClipboardHandling } from "@/lib/types";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

interface ClipboardHandlingProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

const clipboardHandlingOptions = [
  { value: "dont_modify", label: "Don't Modify Clipboard" },
  { value: "copy_to_clipboard", label: "Copy to Clipboard" },
];

export const ClipboardHandlingSetting = ({
  descriptionMode = "tooltip",
  grouped = false,
}: ClipboardHandlingProps) => {
  const selectedHandling = useSetting("clipboard_handling") || "dont_modify";
  const updating = useIsSettingUpdating("clipboard_handling");
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  return (
    <SettingContainer
      description="Don't Modify Clipboard preserves your current clipboard contents after transcription. Copy to Clipboard leaves the transcription result in your clipboard after pasting."
      descriptionMode={descriptionMode}
      grouped={grouped}
      icon={<ClipboardCopy className="h-4 w-4" />}
      title="Clipboard Handling"
    >
      <Select
        disabled={updating}
        onValueChange={(val) =>
          updateSetting("clipboard_handling", val as ClipboardHandling)
        }
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
    </SettingContainer>
  );
};

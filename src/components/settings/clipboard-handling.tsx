import { ClipboardCopy } from "lucide-react";
import { useSettings } from "../../hooks/use-settings";
import type { ClipboardHandling } from "../../lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/Select";
import { SettingContainer } from "../ui/SettingContainer";

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
  const { getSetting, updateSetting, isUpdating } = useSettings();

  const selectedHandling = (getSetting("clipboard_handling") ||
    "dont_modify") as ClipboardHandling;

  return (
    <SettingContainer
      description="Don't Modify Clipboard preserves your current clipboard contents after transcription. Copy to Clipboard leaves the transcription result in your clipboard after pasting."
      descriptionMode={descriptionMode}
      grouped={grouped}
      icon={<ClipboardCopy className="h-4 w-4" />}
      title="Clipboard Handling"
    >
      <Select
        disabled={isUpdating("clipboard_handling")}
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

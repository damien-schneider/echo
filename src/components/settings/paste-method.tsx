import { type as getOsType } from "@tauri-apps/plugin-os";
import { Clipboard } from "lucide-react";
import { useEffect, useState } from "react";
import { useSettings } from "../../hooks/use-settings";
import type { PasteMethod } from "../../lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/Select";
import { SettingContainer } from "../ui/SettingContainer";

interface PasteMethodProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

const getPasteMethodOptions = (osType: string) => {
  const baseOptions = [
    { value: "ctrl_v", label: "Clipboard (Ctrl+V)" },
    { value: "direct", label: "Direct" },
  ];

  // Add Shift+Insert option for Windows and Linux only
  if (osType === "windows" || osType === "linux") {
    baseOptions.push({
      value: "shift_insert",
      label: "Clipboard (Shift+Insert)",
    });
  }

  return baseOptions;
};

export const PasteMethodSetting = ({
  descriptionMode = "tooltip",
  grouped = false,
}: PasteMethodProps) => {
  const { getSetting, updateSetting, isUpdating } = useSettings();
  const [osType, setOsType] = useState<string>("unknown");

  useEffect(() => {
    setOsType(getOsType());
  }, []);

  const selectedMethod = (getSetting("paste_method") ||
    "ctrl_v") as PasteMethod;

  const pasteMethodOptions = getPasteMethodOptions(osType);

  return (
    <SettingContainer
      description="Clipboard (Ctrl+V) simulates Ctrl/Cmd+V keystrokes to paste from your clipboard. Direct tries to use system input methods if possible, otherwise inputs keystrokes one by one into the text field. Clipboard (Shift+Insert) uses the more universal Shift+Insert shortcut, ideal for terminal applications and SSH clients."
      descriptionMode={descriptionMode}
      grouped={grouped}
      icon={<Clipboard className="h-4 w-4" />}
      title="Paste Method"
      tooltipPosition="bottom"
    >
      <Select
        disabled={isUpdating("paste_method")}
        onValueChange={(val) =>
          updateSetting("paste_method", val as PasteMethod)
        }
        value={selectedMethod}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {pasteMethodOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingContainer>
  );
};

import { invoke } from "@tauri-apps/api/core";
import { type as getOsType } from "@tauri-apps/plugin-os";
import { Clipboard, Info } from "lucide-react";
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

const getPasteMethodOptions = (
  osType: string,
  isWayland: boolean
): { value: string; label: string }[] => {
  // On Wayland, only clipboard-only is available (auto-paste not supported)
  if (isWayland) {
    return [{ value: "clipboard_only", label: "Clipboard Only" }];
  }

  const baseOptions = [{ value: "ctrl_v", label: "Clipboard (Ctrl+V)" }];

  // Direct input only available on Linux (X11)
  // On macOS it causes cascading suffix duplication in terminals like Ghostty
  if (osType === "linux") {
    baseOptions.push({ value: "direct", label: "Direct" });
  }

  // Add Shift+Insert option for Windows and Linux only
  if (osType === "windows" || osType === "linux") {
    baseOptions.push({
      value: "shift_insert",
      label: "Clipboard (Shift+Insert)",
    });
  }

  baseOptions.push({
    value: "clipboard_only",
    label: "Clipboard Only (no paste)",
  });

  return baseOptions;
};

export const PasteMethodSetting = ({
  descriptionMode = "tooltip",
  grouped = false,
}: PasteMethodProps) => {
  const { getSetting, updateSetting, isUpdating } = useSettings();
  const [osType, setOsType] = useState<string>("unknown");
  const [isWayland, setIsWayland] = useState(false);

  useEffect(() => {
    setOsType(getOsType());
    invoke<boolean>("is_wayland_session")
      .then(setIsWayland)
      .catch(() => setIsWayland(false));
  }, []);

  const selectedMethod = (getSetting("paste_method") ||
    "ctrl_v") as PasteMethod;

  const pasteMethodOptions = getPasteMethodOptions(osType, isWayland);

  const description = isWayland
    ? "Auto-paste is not available on Wayland. The transcription is copied to your clipboard — paste it manually with Ctrl+V."
    : "Clipboard (Ctrl+V) simulates Ctrl/Cmd+V keystrokes to paste from your clipboard. Direct tries to use system input methods if possible, otherwise inputs keystrokes one by one into the text field. Clipboard (Shift+Insert) uses the more universal Shift+Insert shortcut, ideal for terminal applications and SSH clients. Clipboard Only copies the transcription to your clipboard without pasting it into the active input.";

  return (
    <SettingContainer
      description={description}
      descriptionMode={descriptionMode}
      grouped={grouped}
      icon={<Clipboard className="h-4 w-4" />}
      title="Paste Method"
      tooltipPosition="bottom"
    >
      <div className="flex items-center gap-2">
        <Select
          disabled={isWayland || isUpdating("paste_method")}
          onValueChange={(val) =>
            updateSetting("paste_method", val as PasteMethod)
          }
          value={isWayland ? "clipboard_only" : selectedMethod}
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
        {isWayland && (
          <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </div>
    </SettingContainer>
  );
};

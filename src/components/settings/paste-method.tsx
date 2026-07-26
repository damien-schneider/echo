import { invoke } from "@tauri-apps/api/core";
import { type as getOsType } from "@tauri-apps/plugin-os";
import { Clipboard, Info } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingContainer } from "@/components/ui/setting-container";
import type { PasteMethod } from "@/lib/types";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

interface PasteMethodProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

const getPasteMethodOptions = (
  osType: string,
  isWayland: boolean
): { value: string; label: string }[] => {
  // Wayland: no auto-paste.
  if (isWayland) {
    return [{ label: "Clipboard Only", value: "clipboard_only" }];
  }

  const baseOptions = [{ label: "Clipboard (Ctrl+V)", value: "ctrl_v" }];

  // Linux/X11 only — macOS causes cascading suffix duplication in Ghostty.
  if (osType === "linux") {
    baseOptions.push({ label: "Direct", value: "direct" });
  }

  if (osType === "windows" || osType === "linux") {
    baseOptions.push({
      label: "Clipboard (Shift+Insert)",
      value: "shift_insert",
    });
  }

  baseOptions.push({
    label: "Clipboard Only (no paste)",
    value: "clipboard_only",
  });

  return baseOptions;
};

export const PasteMethodSetting = ({
  descriptionMode = "tooltip",
  grouped = false,
}: PasteMethodProps) => {
  const pasteMethod = useSetting("paste_method");
  const isPasteMethodUpdating = useIsSettingUpdating("paste_method");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const [osType, setOsType] = useState<string>("unknown");
  const [isWayland, setIsWayland] = useState(false);

  useEffect(() => {
    setOsType(getOsType());
    invoke<boolean>("is_wayland_session")
      .then(setIsWayland)
      .catch(() => setIsWayland(false));
  }, []);

  const selectedMethod = pasteMethod || "ctrl_v";

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
          disabled={isWayland || isPasteMethodUpdating}
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

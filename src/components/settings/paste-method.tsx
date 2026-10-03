import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ctrl-ui/react/ui/select";
import { invoke } from "@tauri-apps/api/core";
import { type as getOsType } from "@tauri-apps/plugin-os";
import { Clipboard, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { SettingRow } from "@/features/settings/setting-row";
import type { PasteMethod } from "@/lib/types";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

const getPasteMethodOptions = (
  osType: string,
  isWayland: boolean
): {
  value: PasteMethod;
  label: string;
}[] => {
  if (isWayland) {
    return [{ label: "Clipboard Only", value: "clipboard_only" }];
  }
  const baseOptions: { label: string; value: PasteMethod }[] = [
    { label: "Clipboard (Ctrl+V)", value: "ctrl_v" },
  ];
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
export const PasteMethodSetting = () => {
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
    ? "Auto-paste is unavailable on Wayland. Echo copies the text for you to paste with Ctrl+V."
    : "Choose how Echo inserts your transcription. Clipboard Only copies the text for you to paste manually.";
  return (
    <SettingRow
      description={description}
      icon={<Clipboard className="h-4 w-4" />}
      title="Paste Method"
    >
      <div className="flex items-center gap-2">
        <Select<PasteMethod>
          disabled={isWayland || isPasteMethodUpdating}
          items={pasteMethodOptions}
          onValueChange={(val) => updateSetting("paste_method", val)}
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
    </SettingRow>
  );
};

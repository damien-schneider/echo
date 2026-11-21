import { Switch } from "@ctrl-ui/react/ui/switch";
import { StackIcon } from "@phosphor-icons/react";
import { SettingRow } from "@/features/settings/setting-row";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

export const ShowOverlay = () => {
  const isShown = (useSetting("overlay_position") ?? "edge") === "edge";
  const updating = useIsSettingUpdating("overlay_position");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  return (
    <SettingRow
      description="Drag the overlay to any screen edge."
      icon={<StackIcon className="h-4 w-4" />}
      title="Overlay"
    >
      <Switch
        checked={isShown}
        disabled={updating}
        onCheckedChange={(shown) =>
          updateSetting("overlay_position", shown ? "edge" : "none")
        }
      />
    </SettingRow>
  );
};

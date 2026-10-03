import { Switch } from "@ctrl-ui/react/ui/switch";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ClipboardList } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { SettingRow } from "@/features/settings/setting-row";
import { SettingsSection } from "@/features/settings/settings-section";
import { type Capture, CapturesSchema } from "@/lib/types";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";
import { CaptureEntry } from "./capture-entry";

const DoubleShiftToggle = () => {
  const enabled = useSetting("double_shift_capture_enabled") ?? true;
  const updating = useIsSettingUpdating("double_shift_capture_enabled");
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  return (
    <SettingRow
      description="Select text in any app, then tap Shift twice to save it here."
      icon={<ClipboardList className="h-4 w-4" />}
      title="Save selection with double Shift"
    >
      <Switch
        checked={enabled}
        disabled={updating}
        onCheckedChange={(value) =>
          updateSetting("double_shift_capture_enabled", value)
        }
      />
    </SettingRow>
  );
};
const CapturesList = () => {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [loading, setLoading] = useState(true);
  const loadCaptures = async () => {
    try {
      setCaptures(CapturesSchema.parse(await invoke("get_captures")));
    } catch (error) {
      console.error("Failed to load captures:", error);
    } finally {
      setLoading(false);
    }
  };
  const refreshCaptures = useEffectEvent(loadCaptures);
  useEffect(() => {
    refreshCaptures();
    const unlistenPromise = listen("captures-updated", refreshCaptures);
    return () => {
      unlistenPromise.then((unlisten) => unlisten()).catch(() => undefined);
    };
  }, []);
  const handleDelete = async (id: number) => {
    await invoke("delete_capture", { id });
    setCaptures((previous) => previous.filter((capture) => capture.id !== id));
  };
  if (loading) {
    return (
      <p className="px-4 py-3 text-center text-text/60">Loading captures…</p>
    );
  }
  if (captures.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-8 text-center text-text/60">
        <ClipboardList className="h-10 w-10 opacity-40" />
        <div>
          <p className="font-medium">Nothing captured yet</p>
          <p className="mt-1 text-sm">
            Select text anywhere, then tap Shift twice.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="divide-y divide-border/10">
      {captures.map((capture) => (
        <CaptureEntry
          capture={capture}
          key={capture.id}
          onDelete={handleDelete}
        />
      ))}
    </div>
  );
};
export const CapturesSettings = () => (
  <div className="mx-auto w-full max-w-3xl pb-20">
    <SettingsSection defaultOpen={true} title="Capture">
      <DoubleShiftToggle />
    </SettingsSection>

    <SettingsSection defaultOpen={true} title="Saved">
      <CapturesList />
    </SettingsSection>
  </div>
);

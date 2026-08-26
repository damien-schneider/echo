import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ClipboardList } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CollapsibleSettingsGroup } from "@/components/ui/collapsible-settings-group";
import { SettingContainer } from "@/components/ui/setting-container";
import { Switch } from "@/components/ui/switch";
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
    <SettingContainer
      description="Select text in any app, then tap Shift twice to save it here."
      descriptionMode="inline"
      grouped={true}
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
    </SettingContainer>
  );
};

const CapturesList = () => {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCaptures = useCallback(async () => {
    try {
      setCaptures(CapturesSchema.parse(await invoke("get_captures")));
    } catch (error) {
      console.error("Failed to load captures:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCaptures();
    const unlistenPromise = listen("captures-updated", loadCaptures);

    return () => {
      unlistenPromise.then((unlisten) => unlisten()).catch(() => undefined);
    };
  }, [loadCaptures]);

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
    <CollapsibleSettingsGroup defaultOpen={true} title="Capture">
      <DoubleShiftToggle />
    </CollapsibleSettingsGroup>

    <CollapsibleSettingsGroup defaultOpen={true} title="Saved">
      <CapturesList />
    </CollapsibleSettingsGroup>
  </div>
);

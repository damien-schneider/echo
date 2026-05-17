import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Check, Download, Loader2, Monitor, Sparkles, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MicrophoneSelector } from "@/components/settings/microphone-selector";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingContainer } from "@/components/ui/setting-container";
import { Switch } from "@/components/ui/switch";
import type { ModelInfo } from "@/lib/types";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

interface DiarizationStatus {
  downloaded: boolean;
  downloading: boolean;
}

// Whisper model IDs offered for realtime decoding. Excludes medium/turbo/large
// because they can't keep up with live audio on CPU (and even with Metal,
// add too much latency to feel responsive). Order: lightest first.
const REALTIME_MODEL_IDS = ["tiny", "base", "small"] as const;

const useDiarizationStatus = () => {
  const [status, setStatus] = useState<DiarizationStatus | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      const result = await invoke<DiarizationStatus>("get_diarization_status");
      setStatus(result);
    };
    fetchStatus();

    const unlisteners = [
      listen("model-download-complete", () => fetchStatus()),
      listen("model-download-progress", () => fetchStatus()),
      listen("model-extraction-completed", () => fetchStatus()),
    ];

    return () => {
      for (const unlisten of unlisteners) {
        unlisten.then((fn) => fn());
      }
    };
  }, []);

  return status;
};

const useRealtimeModels = () => {
  const [models, setModels] = useState<ModelInfo[]>([]);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const list = await invoke<ModelInfo[]>("get_available_models");
        const filtered = list.filter((m) =>
          (REALTIME_MODEL_IDS as readonly string[]).includes(m.id)
        );
        // Keep the static order from REALTIME_MODEL_IDS rather than the
        // hashmap-defined order returned by the backend.
        filtered.sort(
          (a, b) =>
            REALTIME_MODEL_IDS.indexOf(
              a.id as (typeof REALTIME_MODEL_IDS)[number]
            ) -
            REALTIME_MODEL_IDS.indexOf(
              b.id as (typeof REALTIME_MODEL_IDS)[number]
            )
        );
        setModels(filtered);
      } catch (err) {
        console.error("Failed to load realtime models:", err);
      }
    };
    fetchModels();

    const unlisteners = [
      listen("model-download-complete", () => fetchModels()),
      listen("model-download-progress", () => fetchModels()),
    ];
    return () => {
      for (const unlisten of unlisteners) {
        unlisten.then((fn) => fn());
      }
    };
  }, []);

  return models;
};

export const MeetingSettings = () => {
  const systemAudioEnabled =
    useSetting("meeting_system_audio_enabled") ?? false;
  const autoSummary = useSetting("meeting_auto_summary") ?? false;
  const realtimeModel = useSetting("realtime_model") ?? "tiny";
  const updatingSystemAudio = useIsSettingUpdating(
    "meeting_system_audio_enabled"
  );
  const updatingAutoSummary = useIsSettingUpdating("meeting_auto_summary");
  const updatingRealtimeModel = useIsSettingUpdating("realtime_model");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const diarizationStatus = useDiarizationStatus();
  const realtimeModels = useRealtimeModels();

  const selectedRealtimeModel = useMemo(
    () => realtimeModels.find((m) => m.id === realtimeModel),
    [realtimeModels, realtimeModel]
  );
  const selectedIsReady = selectedRealtimeModel?.is_downloaded ?? false;
  const selectedIsDownloading = selectedRealtimeModel?.is_downloading ?? false;

  const handleRealtimeModelChange = async (modelId: string) => {
    await updateSetting("realtime_model", modelId);
    const model = realtimeModels.find((m) => m.id === modelId);
    if (model && !model.is_downloaded && !model.is_downloading) {
      try {
        await invoke("download_model", { modelId });
      } catch (err) {
        console.error("Failed to start realtime model download:", err);
      }
    }
  };

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border/20">
      <MicrophoneSelector descriptionMode="tooltip" grouped />
      <SettingContainer
        description="Capture system/output audio in addition to your microphone"
        descriptionMode="tooltip"
        grouped
        icon={<Monitor className="h-4 w-4" />}
        title="Capture system audio"
      >
        <Switch
          checked={systemAudioEnabled}
          disabled={updatingSystemAudio}
          onCheckedChange={(enabled) =>
            updateSetting("meeting_system_audio_enabled", enabled)
          }
        />
      </SettingContainer>
      <SettingContainer
        description="Automatically generate an AI summary when a meeting ends"
        descriptionMode="tooltip"
        grouped
        icon={<Sparkles className="h-4 w-4" />}
        title="Auto-generate summary"
      >
        <Switch
          checked={autoSummary}
          disabled={updatingAutoSummary}
          onCheckedChange={(enabled) =>
            updateSetting("meeting_auto_summary", enabled)
          }
        />
      </SettingContainer>
      <SettingContainer
        description="Model used for live transcription during a meeting. Smaller is faster; the bigger batch model still runs after the meeting ends."
        descriptionMode="tooltip"
        grouped
        icon={<Zap className="h-4 w-4" />}
        title="Realtime model"
      >
        <Select
          disabled={updatingRealtimeModel || realtimeModels.length === 0}
          onValueChange={handleRealtimeModelChange}
          value={realtimeModel}
        >
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue placeholder="Select model" />
          </SelectTrigger>
          <SelectContent>
            {realtimeModels.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                <span className="flex items-center gap-2">
                  <span>{model.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {model.size_mb} MB
                  </span>
                  {model.is_downloaded && (
                    <Check className="size-3 text-emerald-500" />
                  )}
                  {model.is_downloading && (
                    <Loader2 className="size-3 animate-spin" />
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingContainer>
      {selectedRealtimeModel && !selectedIsReady && (
        <div className="flex items-center gap-2 px-4 py-2 text-muted-foreground text-xs">
          {selectedIsDownloading ? (
            <>
              <Loader2 className="size-3 animate-spin" />
              <span>Downloading {selectedRealtimeModel.name}…</span>
            </>
          ) : (
            <>
              <Download className="size-3" />
              <span>
                {selectedRealtimeModel.name} will download on next meeting
                start.
              </span>
            </>
          )}
        </div>
      )}
      {diarizationStatus && !diarizationStatus.downloaded && (
        <div className="flex items-center gap-2 px-4 py-2 text-muted-foreground text-xs">
          {diarizationStatus.downloading ? (
            <>
              <Loader2 className="size-3 animate-spin" />
              <span>Downloading speaker detection model…</span>
            </>
          ) : (
            <>
              <Download className="size-3" />
              <span>
                Speaker detection model is required and will download
                automatically.
              </span>
            </>
          )}
        </div>
      )}
      {diarizationStatus?.downloaded && (
        <div className="flex items-center gap-2 px-4 py-2 text-muted-foreground text-xs">
          <Check className="size-3" />
          <span>Speaker detection ready</span>
        </div>
      )}
    </div>
  );
};

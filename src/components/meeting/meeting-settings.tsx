import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Download, Loader2, Monitor, Sparkles, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { MicrophoneSelector } from "@/components/settings/microphone-selector";
import { SettingContainer } from "@/components/ui/setting-container";
import { Switch } from "@/components/ui/switch";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

interface DiarizationStatus {
  downloaded: boolean;
  downloading: boolean;
}

const useDiarizationStatus = (enabled: boolean) => {
  const [status, setStatus] = useState<DiarizationStatus | null>(null);

  useEffect(() => {
    if (!enabled) {
      setStatus(null);
      return;
    }

    const fetchStatus = async () => {
      const result = await invoke<DiarizationStatus>("get_diarization_status");
      setStatus(result);
    };
    fetchStatus();

    // Re-check on download events
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
  }, [enabled]);

  return status;
};

export const MeetingSettings = () => {
  const systemAudioEnabled =
    useSetting("meeting_system_audio_enabled") ?? false;
  const autoSummary = useSetting("meeting_auto_summary") ?? false;
  const diarizationEnabled = useSetting("meeting_diarization_enabled") ?? false;
  const updatingSystemAudio = useIsSettingUpdating(
    "meeting_system_audio_enabled"
  );
  const updatingAutoSummary = useIsSettingUpdating("meeting_auto_summary");
  const updatingDiarization = useIsSettingUpdating(
    "meeting_diarization_enabled"
  );
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const diarizationStatus = useDiarizationStatus(diarizationEnabled);

  const modelsReady = diarizationStatus?.downloaded;
  const modelsDownloading = diarizationStatus?.downloading;

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
      <div>
        <SettingContainer
          description="Identify different speakers in the transcript"
          descriptionMode="tooltip"
          grouped
          icon={<Users className="h-4 w-4" />}
          title="Speaker detection"
        >
          <Switch
            checked={diarizationEnabled}
            disabled={updatingDiarization}
            onCheckedChange={(enabled) =>
              updateSetting("meeting_diarization_enabled", enabled)
            }
          />
        </SettingContainer>
        {diarizationEnabled && diarizationStatus && !modelsReady && (
          <div className="flex items-center gap-2 px-4 pb-2 text-muted-foreground text-xs">
            {modelsDownloading ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                <span>Downloading speaker detection models…</span>
              </>
            ) : (
              <>
                <Download className="size-3" />
                <span>
                  Speaker detection models will download automatically
                </span>
              </>
            )}
          </div>
        )}
      </div>
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
    </div>
  );
};

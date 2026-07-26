import { Check, Download, Loader2, Monitor, Sparkles } from "lucide-react";
import { MicrophoneSelector } from "@/components/settings/microphone-selector";
import ProgressBar from "@/components/shared/progress-bar";
import { Button } from "@/components/ui/button";
import { SettingContainer } from "@/components/ui/setting-container";
import { Switch } from "@/components/ui/switch";
import { useDiarizationModel } from "@/features/model-download/use-diarization-model";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

export const MeetingSettings = () => {
  const systemAudioEnabled =
    useSetting("meeting_system_audio_enabled") ?? false;
  const autoSummary = useSetting("meeting_auto_summary") ?? false;
  const updatingSystemAudio = useIsSettingUpdating(
    "meeting_system_audio_enabled"
  );
  const updatingAutoSummary = useIsSettingUpdating("meeting_auto_summary");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const diarization = useDiarizationModel();

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
      {diarization.status && !diarization.status.downloaded && (
        <div className="space-y-2 px-4 py-3 text-muted-foreground text-xs">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {diarization.status.downloading ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Download className="size-3" />
              )}
              <span>Speaker detection model</span>
            </div>
            <Button
              disabled={diarization.status.downloading}
              onClick={diarization.download}
              size="sm"
              variant="secondary"
            >
              {diarization.status.downloading ? "Downloading" : "Download"}
            </Button>
          </div>
          {diarization.progress ? (
            <ProgressBar
              fullWidth={true}
              progress={[
                {
                  ...diarization.progress,
                  id: diarization.progress.model_id,
                  label: `${Math.round(diarization.progress.percentage)}%`,
                },
              ]}
              showLabel={true}
              size="small"
            />
          ) : null}
          {diarization.error ? (
            <p className="text-destructive">{diarization.error}</p>
          ) : null}
        </div>
      )}
      {diarization.status?.downloaded && (
        <div className="flex items-center gap-2 px-4 py-2 text-muted-foreground text-xs">
          <Check className="size-3" />
          <span>Speaker detection ready</span>
        </div>
      )}
    </div>
  );
};

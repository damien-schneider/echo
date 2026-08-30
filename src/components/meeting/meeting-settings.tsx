import {
  Check,
  Cloud,
  Download,
  FileText,
  Loader2,
  Monitor,
  Sparkles,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { MicrophoneSelector } from "@/components/settings/microphone-selector";
import ProgressBar from "@/components/shared/progress-bar";
import { Button } from "@/components/ui/button";
import { SettingContainer } from "@/components/ui/setting-container";
import { Switch } from "@/components/ui/switch";
import { useTranscriptionReadiness } from "@/features/meeting/use-transcription-readiness";
import type { DownloadProgress } from "@/features/model-download/download-state";
import { useDiarizationModel } from "@/features/model-download/use-diarization-model";
import { useModelStore } from "@/stores/model-store";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

interface ModelRowProps {
  description: string;
  downloaded: boolean;
  downloading: boolean;
  downloadLabel: string;
  error?: string | null;
  icon: ReactNode;
  onDownload: () => void;
  progress?: DownloadProgress;
  title: string;
}

const ModelRow = ({
  description,
  downloadLabel,
  downloaded,
  downloading,
  error,
  icon,
  onDownload,
  progress,
  title,
}: ModelRowProps) => (
  <div>
    <SettingContainer
      description={description}
      descriptionMode="tooltip"
      grouped
      icon={icon}
      title={title}
    >
      {downloaded ? (
        <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <Check className="size-3" />
          Ready
        </span>
      ) : (
        <Button
          disabled={downloading}
          onClick={onDownload}
          size="sm"
          variant="secondary"
        >
          {downloading ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <Download className="mr-1.5 size-3.5" />
          )}
          {downloading ? "Downloading" : downloadLabel}
        </Button>
      )}
    </SettingContainer>
    {progress && !downloaded ? (
      <div className="px-4 pb-2">
        <ProgressBar
          fullWidth={true}
          progress={[
            {
              ...progress,
              id: progress.model_id,
              label: `${Math.round(progress.percentage)}%`,
            },
          ]}
          showLabel={true}
          size="small"
        />
      </div>
    ) : null}
    {error ? (
      <p className="px-4 pb-2 text-destructive text-xs">{error}</p>
    ) : null}
  </div>
);

export const MeetingSettings = () => {
  const systemAudioEnabled =
    useSetting("meeting_system_audio_enabled") ?? false;
  const autoSummary = useSetting("meeting_auto_summary") ?? false;
  const updatingSystemAudio = useIsSettingUpdating(
    "meeting_system_audio_enabled"
  );
  const updatingAutoSummary = useIsSettingUpdating("meeting_auto_summary");
  const summaryEngine = useSetting("meeting_summary_engine") ?? "local";
  const updatingSummaryEngine = useIsSettingUpdating("meeting_summary_engine");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const diarization = useDiarizationModel();
  const transcription = useTranscriptionReadiness();
  const transcriptionError = useModelStore((s) => s.error);

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
        description="Summaries run on your machine by default. Turn this on to use the AI provider configured in Settings."
        descriptionMode="tooltip"
        grouped
        icon={<Cloud className="h-4 w-4" />}
        title="Summarize in the cloud"
      >
        <Switch
          checked={summaryEngine === "cloud"}
          disabled={updatingSummaryEngine}
          onCheckedChange={(enabled) =>
            updateSetting("meeting_summary_engine", enabled ? "cloud" : "local")
          }
        />
      </SettingContainer>
      {summaryEngine === "cloud" && (
        <p className="px-4 pb-3 text-muted-foreground text-xs">
          Meeting transcripts leave your machine for your AI provider.
        </p>
      )}
      {transcription.known && (
        <ModelRow
          description="Turns the recording into text once the meeting ends"
          downloaded={transcription.ready}
          downloading={transcription.downloading}
          downloadLabel={transcription.resolveLabel}
          error={transcriptionError}
          icon={<FileText className="h-4 w-4" />}
          onDownload={transcription.resolve}
          progress={transcription.progress}
          title="Transcription"
        />
      )}
      {diarization.status && (
        <ModelRow
          description="Tells voices apart so the transcript reads Speaker 1, Guest 2 — without it everyone becomes one speaker"
          downloaded={diarization.status.downloaded}
          downloading={diarization.status.downloading}
          downloadLabel="Download"
          error={diarization.error}
          icon={<Users className="h-4 w-4" />}
          onDownload={diarization.download}
          progress={diarization.progress}
          title="Speaker detection"
        />
      )}
    </div>
  );
};

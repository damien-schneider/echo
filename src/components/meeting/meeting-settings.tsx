import { Button } from "@ctrl-ui/react/ui/button";
import { Switch } from "@ctrl-ui/react/ui/switch";
import {
  CheckIcon,
  CircleNotchIcon,
  CloudIcon,
  DownloadSimpleIcon,
  FileTextIcon,
  MonitorIcon,
  SparkleIcon,
  UsersIcon,
  WaveformIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { MicrophoneSelector } from "@/components/settings/microphone-selector";
import { AiProviderSettings } from "@/components/settings/post-processing-settings-api/ai-provider-settings";
import ProgressBar from "@/components/shared/progress-bar";
import { useTranscriptionReadiness } from "@/features/meeting/use-transcription-readiness";
import type { DownloadProgress } from "@/features/model-download/download-state";
import { useDiarizationModel } from "@/features/model-download/use-diarization-model";
import { useMeetingModel } from "@/features/model-download/use-meeting-model";
import { SettingRow } from "@/features/settings/setting-row";
import { SettingsSection } from "@/features/settings/settings-section";
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
    <SettingRow description={description} icon={icon} title={title}>
      {downloaded ? (
        <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
          <CheckIcon className="size-3" />
          Ready
        </span>
      ) : (
        <Button
          disabled={downloading}
          onClick={onDownload}
          size="sm"
          variant="surface"
        >
          {downloading ? (
            <CircleNotchIcon className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <DownloadSimpleIcon className="mr-1.5 size-3.5" />
          )}
          {downloading ? "Downloading" : downloadLabel}
        </Button>
      )}
    </SettingRow>
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
      <p className="px-4 pb-2 text-caption text-destructive">{error}</p>
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
  const meetingModel = useMeetingModel();
  const transcription = useTranscriptionReadiness();
  const transcriptionError = useModelStore((s) => s.error);
  const showsModels =
    transcription.known ||
    Boolean(diarization.status) ||
    Boolean(meetingModel.status?.supported);
  return (
    <>
      <SettingsSection title="Recording">
        <MicrophoneSelector />
        <SettingRow
          description="Capture system/output audio in addition to your microphone"
          icon={<MonitorIcon className="h-4 w-4" />}
          title="Capture system audio"
        >
          <Switch
            checked={systemAudioEnabled}
            disabled={updatingSystemAudio}
            onCheckedChange={(enabled) =>
              updateSetting("meeting_system_audio_enabled", enabled)
            }
          />
        </SettingRow>
      </SettingsSection>
      <SettingsSection title="Summary">
        <SettingRow
          description="Automatically generate an AI summary when a meeting ends"
          icon={<SparkleIcon className="h-4 w-4" />}
          title="Auto-generate summary"
        >
          <Switch
            checked={autoSummary}
            disabled={updatingAutoSummary}
            onCheckedChange={(enabled) =>
              updateSetting("meeting_auto_summary", enabled)
            }
          />
        </SettingRow>
        <SettingRow
          description="Summaries run on this computer by default. Turn this on to send meeting transcripts to an AI provider instead."
          icon={<CloudIcon className="h-4 w-4" />}
          title="Summarize in the cloud"
        >
          <Switch
            checked={summaryEngine === "cloud"}
            disabled={updatingSummaryEngine}
            onCheckedChange={(enabled) =>
              updateSetting(
                "meeting_summary_engine",
                enabled ? "cloud" : "local"
              )
            }
          />
        </SettingRow>
        {summaryEngine === "cloud" && <AiProviderSettings />}
      </SettingsSection>
      {showsModels && (
        <SettingsSection title="Models">
          {transcription.known && (
            <ModelRow
              description="Turns the recording into text once the meeting ends"
              downloaded={transcription.ready}
              downloading={transcription.downloading}
              downloadLabel={transcription.resolveLabel}
              error={transcriptionError}
              icon={<FileTextIcon className="h-4 w-4" />}
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
              icon={<UsersIcon className="h-4 w-4" />}
              onDownload={diarization.download}
              progress={diarization.progress}
              title="Speaker detection"
            />
          )}
          {meetingModel.status?.supported && (
            <ModelRow
              description="Better accuracy and live text for meetings. 2.8 GB."
              downloaded={meetingModel.status.downloaded}
              downloading={meetingModel.status.downloading}
              downloadLabel="Download"
              error={meetingModel.error}
              icon={<WaveformIcon className="h-4 w-4" />}
              onDownload={meetingModel.download}
              progress={meetingModel.progress}
              title="Meeting transcription (Voxtral)"
            />
          )}
        </SettingsSection>
      )}
    </>
  );
};

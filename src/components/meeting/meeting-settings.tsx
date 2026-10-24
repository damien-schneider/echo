import { Button } from "@ctrl-ui/react/ui/button";
import { Switch } from "@ctrl-ui/react/ui/switch";
import {
  CheckIcon,
  CircleNotchIcon,
  DownloadSimpleIcon,
  FileTextIcon,
  MonitorIcon,
  SparkleIcon,
  UsersIcon,
  WaveformIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { MicrophoneSelector } from "@/components/settings/microphone-selector";
import ProgressBar from "@/components/shared/progress-bar";
import {
  type TranscriptionReadiness,
  useTranscriptionReadiness,
} from "@/features/meeting/use-transcription-readiness";
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
  <div className="flex flex-col gap-2">
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
      <div>
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
    {error ? <p className="text-caption text-destructive">{error}</p> : null}
  </div>
);
const RecordingSettings = () => {
  const systemAudioEnabled =
    useSetting("meeting_system_audio_enabled") ?? false;
  const updatingSystemAudio = useIsSettingUpdating(
    "meeting_system_audio_enabled"
  );
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  return (
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
  );
};

const SummarySettings = () => {
  const autoSummary = useSetting("meeting_auto_summary") ?? false;
  const updatingAutoSummary = useIsSettingUpdating("meeting_auto_summary");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  return (
    <SettingsSection title="Summary">
      <SettingRow
        description="Summarize each meeting with Echo 4B on this computer when it ends"
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
    </SettingsSection>
  );
};

const TranscriptionModelRow = ({
  transcription,
}: {
  transcription: TranscriptionReadiness;
}) => {
  const transcriptionError = useModelStore((s) => s.error);
  return (
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
  );
};

const MeetingModelsSettings = () => {
  const diarization = useDiarizationModel();
  const meetingModel = useMeetingModel();
  const transcription = useTranscriptionReadiness();
  const showsModels =
    transcription.known ||
    Boolean(diarization.status) ||
    Boolean(meetingModel.status?.supported);
  if (!showsModels) {
    return null;
  }
  return (
    <SettingsSection title="Models">
      {transcription.known && (
        <TranscriptionModelRow transcription={transcription} />
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
  );
};

export const MeetingSettings = () => (
  <>
    <RecordingSettings />
    <SummarySettings />
    <MeetingModelsSettings />
  </>
);

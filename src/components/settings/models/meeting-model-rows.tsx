import { ModelActionButton } from "@/components/model-selector/model-action-button";
import {
  ModelRow,
  type ModelRowStatus,
  revealModelFile,
} from "@/components/model-selector/model-row";
import {
  type DownloadProgress,
  modelActionPresentation,
} from "@/features/model-download/download-state";
import {
  diarizationModelId,
  useDiarizationModel,
} from "@/features/model-download/use-diarization-model";
import {
  meetingModelId,
  useMeetingModel,
} from "@/features/model-download/use-meeting-model";
import { SettingsSection } from "@/features/settings/settings-section";
import { formatModelSize } from "@/lib/utils/format";

const VOXTRAL_UNSUPPORTED = "Needs an Apple Silicon Mac with 16 GB of memory.";

interface MeetingModelArtifact {
  download_size_mb: number;
  downloaded: boolean;
  downloading: boolean;
  partial_download_mb: number | null;
}

interface MeetingModelRowProps {
  description: string;
  error?: string;
  modelId: string;
  name: string;
  onDelete: () => Promise<void>;
  onDownload: () => Promise<void>;
  progress?: DownloadProgress;
  status: MeetingModelArtifact | null;
  unavailableReason?: string;
}

const rowStatus = (
  status: MeetingModelArtifact,
  error: string | undefined,
  unavailableReason: string | undefined
): ModelRowStatus | undefined => {
  if (error) {
    return { message: error, tone: "error" };
  }
  if (status.downloaded || status.downloading) {
    return;
  }
  if (unavailableReason) {
    return { message: unavailableReason, tone: "muted" };
  }
  if (status.partial_download_mb === null) {
    return;
  }
  return {
    message: `${formatModelSize(status.partial_download_mb)} of ${formatModelSize(status.download_size_mb)} downloaded`,
    tone: "muted",
  };
};

const MeetingModelRow = ({
  description,
  error,
  modelId,
  name,
  onDelete,
  onDownload,
  progress,
  status,
  unavailableReason,
}: MeetingModelRowProps) => {
  if (!status) {
    return error ? (
      <ModelRow
        description={description}
        name={name}
        status={{ message: error, tone: "error" }}
      />
    ) : null;
  }
  const hasPartialDownload =
    status.partial_download_mb !== null && !status.downloaded;
  const action = modelActionPresentation({
    hasPartialDownload,
    isActive: true,
    isBusy: status.downloading,
    isDownloaded: status.downloaded,
    isDownloading: status.downloading,
  });
  return (
    <ModelRow
      action={
        unavailableReason ? null : (
          <ModelActionButton
            action={action}
            isDownloaded={status.downloaded}
            onClick={onDownload}
          />
        )
      }
      description={description}
      diskMb={status.download_size_mb}
      download={
        status.downloading && progress
          ? { percentage: progress.percentage }
          : undefined
      }
      files={
        (status.downloaded || hasPartialDownload) && !status.downloading
          ? { disabled: false, onDelete, onReveal: revealModelFile(modelId) }
          : undefined
      }
      name={name}
      status={rowStatus(status, error, unavailableReason)}
    />
  );
};

export const MeetingModelsSection = () => {
  const voxtral = useMeetingModel();
  const speakerDetection = useDiarizationModel();
  return (
    <SettingsSection title="Meetings">
      <MeetingModelRow
        description="Transcribes meetings live with better accuracy. Without it, meetings use the transcription model above."
        error={voxtral.error}
        modelId={meetingModelId}
        name="Voxtral Realtime"
        onDelete={voxtral.remove}
        onDownload={voxtral.download}
        progress={voxtral.progress}
        status={voxtral.status}
        unavailableReason={
          voxtral.status?.supported === false ? VOXTRAL_UNSUPPORTED : undefined
        }
      />
      <MeetingModelRow
        description="Tells voices apart so meeting transcripts read Speaker 1, Speaker 2. Meetings wait for it before they are transcribed."
        error={speakerDetection.error}
        modelId={diarizationModelId}
        name="Speaker detection"
        onDelete={speakerDetection.remove}
        onDownload={speakerDetection.download}
        progress={speakerDetection.progress}
        status={speakerDetection.status}
      />
    </SettingsSection>
  );
};

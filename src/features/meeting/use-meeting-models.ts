import { useTranscriptionReadiness } from "@/features/meeting/use-transcription-readiness";
import { useDiarizationModel } from "@/features/model-download/use-diarization-model";

const actionLabel = (
  transcriptionReady: boolean,
  diarizationReady: boolean,
  transcriptionLabel: string
) => {
  if (transcriptionReady) {
    return "Download speaker model";
  }
  return diarizationReady ? transcriptionLabel : "Download models";
};

export const useMeetingModels = () => {
  const transcription = useTranscriptionReadiness();
  const diarization = useDiarizationModel();
  const diarizationReady = diarization.status?.downloaded ?? false;
  const diarizationDownloading = diarization.status?.downloading ?? false;

  return {
    downloading: transcription.downloading || diarizationDownloading,
    ensure: async (): Promise<void> => {
      const jobs: Promise<unknown>[] = [];
      if (!transcription.ready) {
        jobs.push(transcription.resolve());
      }
      if (!diarizationReady) {
        jobs.push(diarization.download());
      }
      await Promise.all(jobs);
    },
    known: transcription.known && diarization.status !== null,
    label: actionLabel(
      transcription.ready,
      diarizationReady,
      transcription.resolveLabel
    ),
    ready: transcription.ready && diarizationReady,
  };
};

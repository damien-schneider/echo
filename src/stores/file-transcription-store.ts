import { create } from "zustand";

export interface FileTranscriptionItem {
  error?: string;
  fileName: string;
  id: string;
  message: string;
  progress: number;
  status: "extracting" | "processing" | "transcribing" | "complete" | "error";
  text?: string;
  timestamp: number;
}

interface FileJobEvent {
  fileName: string | null;
  jobId: number;
}

export interface FileJobProgress extends FileJobEvent {
  message: string;
  progress: number;
  status: string;
}

export interface FileJobCompletion extends FileJobEvent {
  text: string;
  warning: string | null;
}

export interface FileJobFailure extends FileJobEvent {
  message: string;
}

interface FileJobsState {
  items: FileTranscriptionItem[];
  latestJobId: number;
}

interface FileTranscriptionStore extends FileJobsState {
  applyCompletion: (event: FileJobCompletion) => void;
  applyFailure: (event: FileJobFailure) => void;
  applyProgress: (event: FileJobProgress) => void;
  clearCompleted: () => void;
  removeItem: (id: string) => void;
}

type JobUpdate = Partial<FileTranscriptionItem> &
  Pick<FileTranscriptionItem, "message" | "status">;

const isFinished = (item: FileTranscriptionItem) =>
  item.status === "complete" || item.status === "error";

function itemStatusFor(phase: string): FileTranscriptionItem["status"] {
  switch (phase) {
    case "decoding":
      return "extracting";
    case "transcribing":
      return "transcribing";
    default:
      return "processing";
  }
}

function applyToJob(
  state: FileJobsState,
  { fileName, jobId }: FileJobEvent,
  update: JobUpdate
): FileJobsState {
  const id = String(jobId);
  if (jobId > state.latestJobId) {
    const item = {
      fileName: fileName || "Unknown file",
      id,
      progress: 0,
      timestamp: Date.now(),
      ...update,
    };
    return { items: [...state.items, item], latestJobId: jobId };
  }
  return {
    items: state.items.map((item) =>
      item.id === id && !isFinished(item) ? { ...item, ...update } : item
    ),
    latestJobId: state.latestJobId,
  };
}

export const useFileTranscriptionStore = create<FileTranscriptionStore>(
  (set) => ({
    applyCompletion: (event) => {
      set((state) =>
        applyToJob(state, event, {
          error: event.warning ?? undefined,
          message: "Transcription complete!",
          progress: 1.0,
          status: "complete",
          text: event.text,
        })
      );
    },

    applyFailure: (event) => {
      set((state) =>
        applyToJob(state, event, {
          error: event.message,
          message: "Transcription failed",
          status: "error",
        })
      );
    },

    applyProgress: (event) => {
      set((state) =>
        applyToJob(state, event, {
          message: event.message,
          progress: event.progress,
          status: itemStatusFor(event.status),
        })
      );
    },

    clearCompleted: () => {
      set((state) => ({
        items: state.items.filter((item) => !isFinished(item)),
      }));
    },
    items: [],
    latestJobId: 0,

    removeItem: (id) => {
      set((state) => ({
        items: state.items.filter((item) => item.id !== id),
      }));
    },
  })
);

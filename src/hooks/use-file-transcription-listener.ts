import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { listenCancellable } from "@/lib/tauri-listener";
import {
  type FileTranscriptionItem,
  useFileTranscriptionStore,
} from "@/stores/file-transcription-store";

let transcriptionIdCounter = 0;
function generateUniqueId(): string {
  transcriptionIdCounter += 1;
  return `transcription-${Date.now()}-${transcriptionIdCounter}`;
}

interface FileTranscriptionProgress {
  fileName?: string;
  message: string;
  progress: number;
  status: string;
}

interface TranscriptionCompletePayload {
  fileName: string;
  text: string;
}

function mapStatusToItemStatus(
  status: string
): FileTranscriptionItem["status"] {
  switch (status) {
    case "decoding":
      return "extracting";
    case "transcribing":
      return "transcribing";
    case "saving":
      return "processing";
    case "complete":
      return "complete";
    case "error":
      return "error";
    default:
      return "processing";
  }
}

export function useFileTranscriptionListener() {
  const currentTranscriptionId = useRef<string | null>(null);
  const lastCompletedTranscriptionId = useRef<string | null>(null);

  useEffect(() => {
    // getState() inside handlers avoids stale closures + drops deps.
    const store = useFileTranscriptionStore;

    const startNewTranscription = ({
      fileName,
      message,
      progress,
    }: FileTranscriptionProgress) => {
      const id = generateUniqueId();
      store.getState().addItem({
        fileName: fileName || "Unknown file",
        id,
        message,
        progress,
        status: "extracting",
        timestamp: Date.now(),
      });
      currentTranscriptionId.current = id;
    };

    const handleExistingUpdate = (
      id: string,
      { message, progress, status }: FileTranscriptionProgress
    ) => {
      if (status === "complete") {
        store
          .getState()
          .updateItem(id, { message, progress: 1.0, status: "complete" });
        lastCompletedTranscriptionId.current = id;
        currentTranscriptionId.current = null;
      } else if (status === "error") {
        store.getState().updateItem(id, {
          error: message,
          message: "Transcription failed",
          status: "error",
        });
        currentTranscriptionId.current = null;
      } else {
        store.getState().updateItem(id, {
          message,
          progress,
          status: mapStatusToItemStatus(status),
        });
      }
    };

    const createErrorTranscription = (message: string, fileName?: string) => {
      const id = generateUniqueId();
      store.getState().addItem({
        error: message,
        fileName: fileName || "Unknown file",
        id,
        message: "Transcription failed",
        progress: 0,
        status: "error",
        timestamp: Date.now(),
      });
    };

    const unlistenProgress = listenCancellable(() =>
      listen<FileTranscriptionProgress>(
        "file-transcription-progress",
        (event) => {
          const payload = event.payload;
          if (
            payload.status === "decoding" &&
            !currentTranscriptionId.current
          ) {
            startNewTranscription(payload);
          } else if (currentTranscriptionId.current) {
            handleExistingUpdate(currentTranscriptionId.current, payload);
          } else if (payload.status === "error") {
            createErrorTranscription(payload.message, payload.fileName);
          }
        }
      )
    );

    const unlistenComplete = listenCancellable(() =>
      listen<TranscriptionCompletePayload>(
        "transcription-complete",
        (event) => {
          const id =
            currentTranscriptionId.current ??
            lastCompletedTranscriptionId.current;
          if (!id) {
            return;
          }
          store.getState().updateItem(id, {
            message: "Transcription complete!",
            progress: 1.0,
            status: "complete",
            text: event.payload.text,
          });
          currentTranscriptionId.current = null;
          lastCompletedTranscriptionId.current = null;
        }
      )
    );

    const unlistenError = listenCancellable(() =>
      listen<string>("file-transcription-error", (event) => {
        if (!currentTranscriptionId.current) {
          createErrorTranscription(event.payload);
          return;
        }
        store.getState().updateItem(currentTranscriptionId.current, {
          error: event.payload,
          message: "Transcription failed",
          status: "error",
        });
        currentTranscriptionId.current = null;
      })
    );

    return () => {
      unlistenProgress();
      unlistenComplete();
      unlistenError();
    };
  }, []);
}

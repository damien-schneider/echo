import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
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
    let cancelled = false;
    const unlisten: (() => void)[] = [];

    // getState() inside handlers avoids stale closures + drops deps.
    const store = useFileTranscriptionStore;

    const startNewTranscription = (
      progress: number,
      message: string,
      fileName?: string
    ) => {
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
      status: string,
      progress: number,
      message: string
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

    const setupListeners = async () => {
      const progressUnlisten = await listen<FileTranscriptionProgress>(
        "file-transcription-progress",
        (event) => {
          if (cancelled) {
            return;
          }
          const { status, progress, message, fileName } = event.payload;

          if (status === "decoding" && !currentTranscriptionId.current) {
            startNewTranscription(progress, message, fileName);
          } else if (currentTranscriptionId.current) {
            handleExistingUpdate(
              currentTranscriptionId.current,
              status,
              progress,
              message
            );
          } else if (status === "error") {
            createErrorTranscription(message, fileName);
          }
        }
      );
      if (cancelled) {
        progressUnlisten();
        return;
      }
      unlisten.push(progressUnlisten);

      const completeUnlisten = await listen<TranscriptionCompletePayload>(
        "transcription-complete",
        (event) => {
          if (cancelled) {
            return;
          }
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
      );
      if (cancelled) {
        completeUnlisten();
        return;
      }
      unlisten.push(completeUnlisten);

      const errorUnlisten = await listen<string>(
        "file-transcription-error",
        (event) => {
          if (cancelled) {
            return;
          }
          if (currentTranscriptionId.current) {
            store.getState().updateItem(currentTranscriptionId.current, {
              error: event.payload,
              message: "Transcription failed",
              status: "error",
            });
            currentTranscriptionId.current = null;
          } else {
            const id = generateUniqueId();
            store.getState().addItem({
              error: event.payload,
              fileName: "Unknown file",
              id,
              message: "Transcription failed",
              progress: 0,
              status: "error",
              timestamp: Date.now(),
            });
          }
        }
      );
      if (cancelled) {
        errorUnlisten();
        return;
      }
      unlisten.push(errorUnlisten);
    };

    setupListeners();

    return () => {
      cancelled = true;
      for (const fn of unlisten) {
        fn();
      }
    };
  }, []); // Store actions via getState(); no deps needed.
}

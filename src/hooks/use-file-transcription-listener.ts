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

    // Use getState() inside event handlers to avoid stale closures
    // and to remove addItem/updateItem from the dependency array entirely.
    const store = useFileTranscriptionStore;

    const startNewTranscription = (
      progress: number,
      message: string,
      fileName?: string
    ) => {
      const id = generateUniqueId();
      store.getState().addItem({
        id,
        fileName: fileName || "Unknown file",
        status: "extracting",
        progress,
        message,
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
          .updateItem(id, { status: "complete", progress: 1.0, message });
        lastCompletedTranscriptionId.current = id;
        currentTranscriptionId.current = null;
      } else if (status === "error") {
        store.getState().updateItem(id, {
          status: "error",
          message: "Transcription failed",
          error: message,
        });
        currentTranscriptionId.current = null;
      } else {
        store.getState().updateItem(id, {
          status: mapStatusToItemStatus(status),
          progress,
          message,
        });
      }
    };

    const createErrorTranscription = (message: string, fileName?: string) => {
      const id = generateUniqueId();
      store.getState().addItem({
        id,
        fileName: fileName || "Unknown file",
        status: "error",
        progress: 0,
        message: "Transcription failed",
        error: message,
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
            status: "complete",
            progress: 1.0,
            message: "Transcription complete!",
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
              status: "error",
              message: "Transcription failed",
              error: event.payload,
            });
            currentTranscriptionId.current = null;
          } else {
            const id = generateUniqueId();
            store.getState().addItem({
              id,
              fileName: "Unknown file",
              status: "error",
              progress: 0,
              message: "Transcription failed",
              error: event.payload,
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
  }, []); // No deps — store actions accessed via getState()
}

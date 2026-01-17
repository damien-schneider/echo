import { listen } from "@tauri-apps/api/event";
import { useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import {
  addNotificationAtom,
  updateNotificationAtom,
} from "@/stores/notification-atoms";

interface FileTranscriptionProgress {
  status: string;
  progress: number;
  message: string;
}

const DEFAULT_FILE_NAME = "Unknown file";

export const useFileTranscriptionNotifications = () => {
  const addNotification = useSetAtom(addNotificationAtom);
  const updateNotification = useSetAtom(updateNotificationAtom);
  const currentNotificationId = useRef<string | null>(null);

  useEffect(() => {
    const handleProgressUpdate = (
      status: string,
      progress: number,
      message: string
    ) => {
      if (currentNotificationId.current) {
        if (status === "complete") {
          updateNotification({
            id: currentNotificationId.current,
            status: "complete",
            progress: 1,
            message: "Transcription complete!",
          });
          currentNotificationId.current = null;
        } else if (status === "error") {
          updateNotification({
            id: currentNotificationId.current,
            status: "error",
            progress: 0,
            message: "Transcription failed",
            error: message,
          });
          currentNotificationId.current = null;
        } else {
          updateNotification({
            id: currentNotificationId.current,
            status: "processing",
            progress,
            message,
          });
        }
      } else {
        // Create a new notification if we don't have one
        const notificationId = addNotification({
          fileName: DEFAULT_FILE_NAME,
          status: status === "complete" ? "complete" : "processing",
          progress,
          message,
        });
        if (status !== "complete") {
          currentNotificationId.current = notificationId;
        }
      }
    };

    let isMounted = true;
    let cleanup: (() => void) | null = null;

    const setupListeners = async () => {
      // Listen for file drop to create notification
      const unlistenDrop = await listen("file-drop", () => {
        const notificationId = addNotification({
          fileName: DEFAULT_FILE_NAME,
          status: "pending",
          progress: 0,
          message: "Preparing to transcribe",
        });
        currentNotificationId.current = notificationId;
      });

      // Listen for transcription progress
      const unlistenProgress = await listen<FileTranscriptionProgress>(
        "file-transcription-progress",
        (event) => {
          const { status, progress, message } = event.payload;
          handleProgressUpdate(status, progress, message);
        }
      );

      // Listen for transcription complete event to get file name
      const unlistenComplete = await listen<{ text: string; fileName: string }>(
        "transcription-complete",
        (event) => {
          if (currentNotificationId.current) {
            updateNotification({
              id: currentNotificationId.current,
              status: "complete",
              progress: 1,
              message: `Successfully transcribed ${event.payload.fileName}`,
            });
            currentNotificationId.current = null;
          }
        }
      );

      // Listen for errors
      const unlistenError = await listen<string>(
        "show-error-dialog",
        (event) => {
          if (currentNotificationId.current) {
            updateNotification({
              id: currentNotificationId.current,
              status: "error",
              progress: 0,
              message: "Transcription failed",
              error: event.payload,
            });
            currentNotificationId.current = null;
          }
        }
      );

      cleanup = () => {
        unlistenDrop();
        unlistenProgress();
        unlistenComplete();
        unlistenError();
      };

      // Call cleanup immediately if component has unmounted while setting up
      if (!isMounted && cleanup) {
        cleanup();
        cleanup = null;
      }
    };

    setupListeners();

    return () => {
      isMounted = false;
      if (cleanup) {
        cleanup();
      }
    };
  }, [addNotification, updateNotification]);
};

import { listen } from "@tauri-apps/api/event";
import { useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import {
  addNotificationAtom,
  updateNotificationAtom,
  type FileNotification,
} from "@/stores/notification-atoms";

interface FileTranscriptionProgress {
  status: string;
  progress: number;
  message: string;
}

export const useFileTranscriptionNotifications = () => {
  const addNotification = useSetAtom(addNotificationAtom);
  const updateNotification = useSetAtom(updateNotificationAtom);
  const currentNotificationId = useRef<string | null>(null);

  useEffect(() => {
    const setupListeners = async () => {
      // Listen for drag enter to create initial notification
      const unlistenDragEnter = await listen("drag-enter", () => {
        // We'll create notification on drop instead
      });

      // Listen for file drop to create notification
      const unlistenDrop = await listen("file-drop", () => {
        const notificationId = addNotification({
          fileName: "Processing file...",
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
              fileName: "File",
              status: status === "complete" ? "complete" : "processing",
              progress,
              message,
            });
            if (status !== "complete") {
              currentNotificationId.current = notificationId;
            }
          }
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

      return () => {
        unlistenDragEnter();
        unlistenDrop();
        unlistenProgress();
        unlistenComplete();
        unlistenError();
      };
    };

    const cleanup = setupListeners();
    return () => {
      cleanup.then((fn) => fn());
    };
  }, [addNotification, updateNotification]);
};

import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { listenCancellable } from "@/lib/tauri-listener";
import {
  type FileJobCompletion,
  type FileJobFailure,
  type FileJobProgress,
  useFileTranscriptionStore,
} from "@/stores/file-transcription-store";

export function useFileTranscriptionListener() {
  useEffect(() => {
    // getState() inside handlers avoids stale closures + drops deps.
    const store = useFileTranscriptionStore;

    const unlistenFns = [
      listenCancellable(() =>
        listen<FileJobProgress>("file-transcription-progress", (event) =>
          store.getState().applyProgress(event.payload)
        )
      ),
      listenCancellable(() =>
        listen<FileJobCompletion>("transcription-complete", (event) =>
          store.getState().applyCompletion(event.payload)
        )
      ),
      listenCancellable(() =>
        listen<FileJobFailure>("file-transcription-error", (event) =>
          store.getState().applyFailure(event.payload)
        )
      ),
    ];

    return () => {
      for (const unlisten of unlistenFns) {
        unlisten();
      }
    };
  }, []);
}

import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import type {
  MeetingBatchProgress,
  MeetingSegment,
  MeetingStatus,
  StreamingFinal,
  StreamingInterim,
} from "@/lib/types";
import { useMeetingStore } from "@/stores/meeting-store";

export function useMeetingListener() {
  useEffect(() => {
    let cancelled = false;
    const unlisten: (() => void)[] = [];
    const store = useMeetingStore;

    const setup = async () => {
      // Live segment added during recording
      unlisten.push(
        await listen<MeetingSegment>("meeting-segment-added", (event) => {
          if (cancelled) {
            return;
          }
          store.getState().addLiveSegment(event.payload);
        })
      );

      // Streaming interim text (greyed) updates while recording
      unlisten.push(
        await listen<StreamingInterim>("meeting-streaming-interim", (event) => {
          if (cancelled) {
            return;
          }
          store.getState().applyStreamingInterim(event.payload);
        })
      );

      // Streaming finalized segment from LA-2 commit while recording
      unlisten.push(
        await listen<StreamingFinal>("meeting-streaming-final", (event) => {
          if (cancelled) {
            return;
          }
          store.getState().applyStreamingFinal(event.payload);
        })
      );

      // Batch transcription progress (during processing phase after stop)
      unlisten.push(
        await listen<MeetingBatchProgress>(
          "meeting-batch-progress",
          (event) => {
            if (cancelled) {
              return;
            }
            store.getState().applyBatchProgress(event.payload);
          }
        )
      );

      // Status transitions
      unlisten.push(
        await listen<MeetingStatus>("meeting-status-changed", (event) => {
          if (cancelled) {
            return;
          }
          const status = event.payload;
          if (status === "complete") {
            // Backend just finished the batch pass. Clear all live recording
            // state so the next start_meeting boots from a clean slate, and
            // refresh the meetings list so the just-finished meeting shows up.
            useMeetingStore.setState({
              status: "idle",
              currentMeetingId: null,
              elapsedMs: 0,
              liveSegments: [],
              streamingFinals: [],
              interimSegments: { mic: null, system: null },
              batchProgress: {},
            });
            store.getState().loadMeetings();
          } else if (status === "processing") {
            store.getState().setStatus("processing");
          } else if (status === "recording") {
            store.getState().setStatus("recording");
          }
        })
      );

      // Summary generated
      unlisten.push(
        await listen<number>("meeting-summary-generated", (event) => {
          if (cancelled) {
            return;
          }
          const state = store.getState();
          if (state.selectedMeeting?.id === event.payload) {
            state.selectMeeting(event.payload);
          }
          state.loadMeetings();
        })
      );

      // Auto-summary requested by backend when meeting completes
      unlisten.push(
        await listen<number>("meeting-auto-summary-requested", (event) => {
          if (cancelled) {
            return;
          }
          store.getState().generateSummary(event.payload);
        })
      );
    };

    setup();

    return () => {
      cancelled = true;
      for (const fn of unlisten) {
        fn();
      }
    };
  }, []);
}

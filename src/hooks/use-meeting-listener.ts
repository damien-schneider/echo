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
      unlisten.push(
        await listen<MeetingSegment>("meeting-segment-added", (event) => {
          if (cancelled) {
            return;
          }
          store.getState().addLiveSegment(event.payload);
        })
      );

      unlisten.push(
        await listen<StreamingInterim>("meeting-streaming-interim", (event) => {
          if (cancelled) {
            return;
          }
          store.getState().applyStreamingInterim(event.payload);
        })
      );

      // LA-2 commit during recording.
      unlisten.push(
        await listen<StreamingFinal>("meeting-streaming-final", (event) => {
          if (cancelled) {
            return;
          }
          store.getState().applyStreamingFinal(event.payload);
        })
      );

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

      unlisten.push(
        await listen<MeetingStatus>("meeting-status-changed", (event) => {
          if (cancelled) {
            return;
          }
          const status = event.payload;
          if (status === "complete") {
            // Reset live state for clean next start_meeting; refresh list.
            useMeetingStore.setState({
              batchProgress: {},
              currentMeetingId: null,
              elapsedMs: 0,
              interimSegments: { mic: null, system: null },
              liveSegments: [],
              status: "idle",
              streamingFinals: [],
            });
            store.getState().loadMeetings();
          } else if (status === "processing") {
            store.getState().setStatus("processing");
          } else if (status === "recording") {
            store.getState().setStatus("recording");
          }
        })
      );

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

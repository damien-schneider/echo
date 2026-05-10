import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import type { MeetingSegment, MeetingStatus } from "@/lib/types";
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

      // Status transitions
      unlisten.push(
        await listen<MeetingStatus>("meeting-status-changed", (event) => {
          if (cancelled) {
            return;
          }
          const status = event.payload;
          if (status === "complete") {
            store.getState().setStatus("idle");
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

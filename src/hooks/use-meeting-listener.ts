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

const store = useMeetingStore;

const onStatusChanged = (status: MeetingStatus) => {
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
    return;
  }
  if (status === "processing" || status === "recording") {
    store.getState().setStatus(status);
  }
};

const onSummaryGenerated = (meetingId: number) => {
  const state = store.getState();
  if (state.selectedMeeting?.id === meetingId) {
    state.selectMeeting(meetingId);
  }
  state.loadMeetings();
};

export function useMeetingListener() {
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void)[] = [];

    const release = () => {
      for (const fn of unlisten) {
        fn();
      }
      unlisten = [];
    };

    Promise.all([
      listen<MeetingSegment>("meeting-segment-added", (e) =>
        store.getState().addLiveSegment(e.payload)
      ),
      listen<StreamingInterim>("meeting-streaming-interim", (e) =>
        store.getState().applyStreamingInterim(e.payload)
      ),
      // LA-2 commit during recording.
      listen<StreamingFinal>("meeting-streaming-final", (e) =>
        store.getState().applyStreamingFinal(e.payload)
      ),
      listen<MeetingBatchProgress>("meeting-batch-progress", (e) =>
        store.getState().applyBatchProgress(e.payload)
      ),
      listen<MeetingStatus>("meeting-status-changed", (e) =>
        onStatusChanged(e.payload)
      ),
      listen<number>("meeting-summary-generated", (e) =>
        onSummaryGenerated(e.payload)
      ),
      listen<number>("meeting-auto-summary-requested", (e) =>
        store.getState().generateSummary(e.payload)
      ),
    ]).then((fns) => {
      unlisten = fns;
      // Unmounting mid-registration used to leave every listener resolved after it behind.
      if (cancelled) {
        release();
      }
    });

    return () => {
      cancelled = true;
      release();
    };
  }, []);
}

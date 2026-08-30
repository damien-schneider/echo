import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { toast } from "sonner";
import {
  MeetingSummaryError,
  SUMMARY_SETUP_LABELS,
} from "@/lib/llm/meeting-summary";
import {
  ActiveMeetingSchema,
  type MeetingAudioWarning,
  type MeetingBatchProgress,
  type MeetingSegment,
  type MeetingStatus,
  type StreamingFinal,
  type StreamingInterim,
} from "@/lib/types";
import { errorMessage } from "@/lib/utils";
import { useMeetingStore } from "@/stores/meeting-store";

const store = useMeetingStore;

const idleState = () => ({
  batchProgress: {},
  currentMeetingId: null,
  elapsedMs: 0,
  interimSegments: { mic: null, system: null },
  liveSegments: [],
  status: "idle" as const,
  streamingFinals: [],
});

const onStatusChanged = (status: MeetingStatus) => {
  if (status === "recording" || status === "processing") {
    store.getState().setStatus(status);
    return;
  }
  // Reset live state for clean next start_meeting; refresh list.
  useMeetingStore.setState(idleState());
  store.getState().loadMeetings();
  if (status === "error") {
    toast.error(
      "Transcription failed — the recording is kept, try Retranscribe"
    );
  }
  if (status === "partial") {
    toast.warning(
      "Part of the audio could not be transcribed — Retranscribe to retry"
    );
  }
  if (status === "recorded") {
    toast.warning("Meeting saved — its transcript needs the models first", {
      action: {
        label: "Open meeting",
        onClick: () => {
          emit("open-settings-section", "meeting");
        },
      },
    });
  }
};

const onSummaryGenerated = (meetingId: number) => {
  const state = store.getState();
  if (state.selectedMeeting?.id === meetingId) {
    state.selectMeeting(meetingId);
  }
  state.loadMeetings();
};

const onAudioWarning = ({ source, reason }: MeetingAudioWarning) => {
  if (reason === "write") {
    toast.error(
      "The recording can no longer be saved — free up disk space. Audio up to now is kept."
    );
    return;
  }
  toast.warning(
    source === "system"
      ? "System audio stopped — the meeting keeps recording your microphone"
      : "Microphone stopped delivering audio — check its access and connection"
  );
};

// A meeting can start anywhere — the tray, another window — and the page must show it running.
const onActiveMeeting = (payload: unknown) => {
  const parsed = ActiveMeetingSchema.nullable().safeParse(payload);
  // The end of a meeting arrives as its status, with the transcript that comes with it.
  if (!parsed.success || parsed.data === null) {
    return;
  }
  const active = parsed.data;
  if (active.state === "processing") {
    store.getState().setStatus("processing");
    return;
  }
  useMeetingStore.setState({
    currentMeetingId: active.meeting_id,
    elapsedMs: Math.max(0, Date.now() - active.start_time * 1000),
    status: "recording",
  });
};

// The meeting this window opened into: everything after it arrives as an event.
const adoptActiveMeeting = async () => {
  const payload = await invoke<unknown>("get_active_meeting");
  if (store.getState().status === "idle") {
    onActiveMeeting(payload);
  }
};

const onAutoSummaryRequested = (meetingId: number) => {
  store
    .getState()
    .generateSummary(meetingId)
    .catch((error: unknown) => {
      if (error instanceof MeetingSummaryError) {
        toast.error(error.message, {
          action: {
            label: SUMMARY_SETUP_LABELS[error.section],
            onClick: () => {
              emit("open-settings-section", error.section);
            },
          },
        });
        return;
      }
      toast.error(errorMessage(error, "Failed to generate summary"));
    });
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
      listen<unknown>("meeting-active", (e) => onActiveMeeting(e.payload)),
      listen<MeetingAudioWarning>("meeting-audio-warning", (e) =>
        onAudioWarning(e.payload)
      ),
      listen<number>("meeting-summary-generated", (e) =>
        onSummaryGenerated(e.payload)
      ),
      listen<number>("meeting-auto-summary-requested", (e) =>
        onAutoSummaryRequested(e.payload)
      ),
    ]).then((fns) => {
      unlisten = fns;
      // Unmounting mid-registration used to leave every listener resolved after it behind.
      if (cancelled) {
        release();
        return;
      }
      // After the listeners: a status event that lands first must not be overwritten.
      adoptActiveMeeting().catch(() => undefined);
    });

    return () => {
      cancelled = true;
      release();
    };
  }, []);
}

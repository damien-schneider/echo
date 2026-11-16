import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { generateMeetingSummary } from "@/lib/llm/meeting-summary";
import type {
  ActiveMeeting,
  ExportFormat,
  Meeting,
  MeetingBatchProgress,
  MeetingSegment,
  MeetingStatus,
  StreamingFinal,
  StreamingInterim,
  StreamingSource,
} from "@/lib/types";

export interface InterimSegmentState {
  committedText: string;
  segmentStartMs: number;
  source: StreamingSource;
  tentativeText: string;
}

export type MeetingActivity = "idle" | "recording" | "processing";

interface MeetingStore {
  // What the backend is doing, as it last pushed it; nothing on the page decides this.
  activity: MeetingActivity;
  addLiveSegment: (segment: MeetingSegment) => void;
  applyActiveMeeting: (active: ActiveMeeting) => void;
  applyBatchProgress: (event: MeetingBatchProgress) => void;
  applyMeetingStatus: (status: MeetingStatus) => Promise<void>;
  applyStreamingFinal: (event: StreamingFinal) => void;
  applyStreamingInterim: (event: StreamingInterim) => void;
  applySummaryGenerated: (meetingId: number) => Promise<void>;
  batchProgress: Record<string, MeetingBatchProgress | null>;
  currentMeetingId: number | null;
  deleteMeeting: (id: number) => Promise<void>;
  elapsedMs: number;
  exportMeeting: (id: number, format: ExportFormat) => Promise<string>;
  generateSummary: (id: number) => Promise<void>;
  interimSegments: Record<StreamingSource, InterimSegmentState | null>;
  liveSegments: MeetingSegment[];
  loadMeetings: () => Promise<void>;
  meetings: Meeting[];
  renameSpeaker: (
    meetingId: number,
    oldLabel: string,
    newLabel: string
  ) => Promise<void>;
  retranscribeMeeting: (id: number) => Promise<MeetingStatus>;
  selectedMeeting: Meeting | null;
  selectedMeetingId: number | null;
  selectedSegments: MeetingSegment[];
  selectMeeting: (id: number) => Promise<void>;
  setElapsedMs: (ms: number) => void;
  startMeeting: (title?: string) => Promise<number>;
  stopMeeting: () => Promise<void>;
  // Streaming finals emitted during recording; liveSegments come from post-meeting batch.
  streamingFinals: MeetingSegment[];
  unselectMeeting: () => void;
}

const isForeignMeeting = (
  state: { currentMeetingId: number | null },
  meetingId: number
) => state.currentMeetingId !== null && state.currentMeetingId !== meetingId;

const emptyInterimSegments = (): Record<
  StreamingSource,
  InterimSegmentState | null
> => ({
  mic: null,
  system: null,
});

// Open live lines are never finalized after capture stops; finished ones wait for batch rows.
const processingMeeting = (): Partial<MeetingStore> => ({
  activity: "processing",
  interimSegments: emptyInterimSegments(),
});

const idleMeeting = (): Partial<MeetingStore> => ({
  activity: "idle",
  batchProgress: {},
  currentMeetingId: null,
  elapsedMs: 0,
  interimSegments: emptyInterimSegments(),
  liveSegments: [],
  streamingFinals: [],
});

export const useMeetingStore = create<MeetingStore>((set, get) => ({
  activity: "idle",

  addLiveSegment: (segment) => {
    set((state) =>
      isForeignMeeting(state, segment.meeting_id)
        ? {}
        : { liveSegments: [...state.liveSegments, segment] }
    );
  },

  applyActiveMeeting: (active) => {
    set(
      active.state === "recording"
        ? {
            activity: "recording",
            currentMeetingId: active.meeting_id,
            elapsedMs: Math.max(0, Date.now() - active.start_time * 1000),
          }
        : processingMeeting()
    );
  },

  applyBatchProgress: (event) => {
    set((state) => ({
      batchProgress: {
        ...state.batchProgress,
        [event.source]: event,
      },
    }));
  },

  applyMeetingStatus: async (status) => {
    if (status === "recording") {
      set({ activity: "recording" });
      return;
    }
    if (status === "processing") {
      set(processingMeeting());
      return;
    }
    const finishedMeetingId = get().currentMeetingId;
    set(idleMeeting());
    await get().loadMeetings();
    if (finishedMeetingId !== null) {
      await get().selectMeeting(finishedMeetingId);
    }
  },

  applyStreamingFinal: (event) => {
    set((state) => {
      if (isForeignMeeting(state, event.meeting_id)) {
        return {};
      }
      return {
        interimSegments: {
          ...state.interimSegments,
          [event.source]: null,
        },
        // id=0 marks not-yet-persisted; post-meeting batch creates canonical row.
        streamingFinals: [
          ...state.streamingFinals,
          {
            audio_source: event.source,
            confidence: null,
            end_ms: event.end_ms,
            id: 0,
            meeting_id: event.meeting_id,
            speaker_label: event.source === "system" ? "Guest" : "Speaker",
            start_ms: event.start_ms,
            text: event.text,
          },
        ],
      };
    });
  },

  applyStreamingInterim: (event) => {
    set((state) =>
      isForeignMeeting(state, event.meeting_id)
        ? {}
        : {
            interimSegments: {
              ...state.interimSegments,
              [event.source]: {
                committedText: event.committed_text,
                segmentStartMs: event.segment_start_ms,
                source: event.source,
                tentativeText: event.tentative_text,
              },
            },
          }
    );
  },

  applySummaryGenerated: async (meetingId) => {
    const state = get();
    await Promise.all([
      state.selectedMeetingId === meetingId && state.selectMeeting(meetingId),
      state.loadMeetings(),
    ]);
  },
  batchProgress: {},
  currentMeetingId: null,

  deleteMeeting: async (id) => {
    await invoke("delete_meeting", { id });
    const state = get();
    if (state.selectedMeetingId === id) {
      state.unselectMeeting();
    }
    await state.loadMeetings();
  },
  elapsedMs: 0,

  exportMeeting: async (id, format) => {
    const content = await invoke<string>("export_meeting", { format, id });
    return content;
  },

  generateSummary: async (id) => {
    const transcript = await invoke<string>(
      "get_meeting_transcript_for_summary",
      { meetingId: id }
    );
    const summary = await generateMeetingSummary(transcript);
    await invoke("save_meeting_summary", { meetingId: id, summary });
    const meeting = await invoke<Meeting>("get_meeting", { id });
    if (get().selectedMeetingId === id) {
      set({ selectedMeeting: meeting });
    }
  },
  interimSegments: emptyInterimSegments(),
  liveSegments: [],

  loadMeetings: async () => {
    const meetings = await invoke<Meeting[]>("list_meetings");
    set({ meetings });
  },
  meetings: [],

  renameSpeaker: async (meetingId, oldLabel, newLabel) => {
    await invoke("rename_meeting_speaker", {
      meetingId,
      newLabel,
      oldLabel,
    });
    const segments = await invoke<MeetingSegment[]>("get_meeting_segments", {
      meetingId,
    });
    set({ selectedSegments: segments });
  },

  retranscribeMeeting: async (id) => {
    set({
      batchProgress: {},
      currentMeetingId: id,
      interimSegments: emptyInterimSegments(),
      liveSegments: [],
      streamingFinals: [],
    });
    try {
      return await invoke<MeetingStatus>("retranscribe_meeting", {
        meetingId: id,
      });
    } catch (error) {
      set({ currentMeetingId: null });
      throw error;
    }
  },
  selectedMeeting: null,
  selectedMeetingId: null,
  selectedSegments: [],

  selectMeeting: async (id) => {
    set({ selectedMeetingId: id });
    try {
      const meeting = await invoke<Meeting>("get_meeting", { id });
      const segments = await invoke<MeetingSegment[]>("get_meeting_segments", {
        meetingId: id,
      });
      if (get().selectedMeetingId === id) {
        set({ selectedMeeting: meeting, selectedSegments: segments });
      }
    } catch (error) {
      const state = get();
      if (state.selectedMeetingId === id && state.selectedMeeting?.id !== id) {
        state.unselectMeeting();
      }
      throw error;
    }
  },
  setElapsedMs: (ms) => set({ elapsedMs: ms }),

  startMeeting: async (title) => {
    const id = await invoke<number>("start_meeting", { title: title ?? null });
    set({
      batchProgress: {},
      currentMeetingId: id,
      elapsedMs: 0,
      interimSegments: emptyInterimSegments(),
      liveSegments: [],
      streamingFinals: [],
    });
    return id;
  },

  // stop_meeting returns on capture stop; batch transcription completes via meeting-status-changed("complete").
  stopMeeting: async () => {
    await invoke("stop_meeting");
  },
  streamingFinals: [],

  unselectMeeting: () => {
    set({
      selectedMeeting: null,
      selectedMeetingId: null,
      selectedSegments: [],
    });
  },
}));

export type MeetingPageView = "live" | "detail" | "list";

export const meetingPageView = (
  state: Pick<
    MeetingStore,
    "activity" | "selectedMeeting" | "selectedMeetingId"
  >
): MeetingPageView => {
  if (state.activity !== "idle") {
    return "live";
  }
  return state.selectedMeeting?.id === state.selectedMeetingId
    ? "detail"
    : "list";
};

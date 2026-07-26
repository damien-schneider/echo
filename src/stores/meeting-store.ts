import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { generateMeetingSummary } from "@/lib/llm/meeting-summary";
import type {
  ExportFormat,
  Meeting,
  MeetingBatchProgress,
  MeetingSegment,
  StreamingFinal,
  StreamingInterim,
  StreamingSource,
} from "@/lib/types";
import { useSettingsStore } from "@/stores/settings-store";

export interface InterimSegmentState {
  committedText: string;
  segmentStartMs: number;
  source: StreamingSource;
  tentativeText: string;
}

interface MeetingStore {
  addLiveSegment: (segment: MeetingSegment) => void;
  applyBatchProgress: (event: MeetingBatchProgress) => void;
  applyStreamingFinal: (event: StreamingFinal) => void;
  applyStreamingInterim: (event: StreamingInterim) => void;
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
  retranscribeMeeting: (id: number) => Promise<void>;
  selectedMeeting: Meeting | null;
  selectedSegments: MeetingSegment[];
  selectMeeting: (id: number) => Promise<void>;
  setElapsedMs: (ms: number) => void;
  setStatus: (status: MeetingStore["status"]) => void;
  startMeeting: (title?: string) => Promise<number>;
  status: "idle" | "recording" | "processing" | "viewing";
  stopMeeting: () => Promise<void>;
  // Streaming finals emitted during recording; liveSegments come from post-meeting batch.
  streamingFinals: MeetingSegment[];
  unselectMeeting: () => void;
}

const emptyInterimSegments = (): Record<
  StreamingSource,
  InterimSegmentState | null
> => ({
  mic: null,
  system: null,
});

export const useMeetingStore = create<MeetingStore>((set, get) => ({
  addLiveSegment: (segment) => {
    set((state) => ({
      liveSegments: [...state.liveSegments, segment],
    }));
  },

  applyBatchProgress: (event) => {
    set((state) => ({
      batchProgress: {
        ...state.batchProgress,
        [event.source]: event,
      },
    }));
  },

  applyStreamingFinal: (event) => {
    set((state) => ({
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
          speaker_label: event.source === "system" ? "System" : "Speaker",
          start_ms: event.start_ms,
          text: event.text,
        },
      ],
    }));
  },

  applyStreamingInterim: (event) => {
    set((state) => ({
      interimSegments: {
        ...state.interimSegments,
        [event.source]: {
          committedText: event.committed_text,
          segmentStartMs: event.segment_start_ms,
          source: event.source,
          tentativeText: event.tentative_text,
        },
      },
    }));
  },
  batchProgress: {},
  currentMeetingId: null,

  deleteMeeting: async (id) => {
    await invoke("delete_meeting", { id });
    const state = get();
    if (state.selectedMeeting?.id === id) {
      set({ selectedMeeting: null, selectedSegments: [], status: "idle" });
    }
    await state.loadMeetings();
  },
  elapsedMs: 0,

  exportMeeting: async (id, format) => {
    const content = await invoke<string>("export_meeting", { format, id });
    return content;
  },

  generateSummary: async (id) => {
    const settings = useSettingsStore.getState().settings;
    if (!settings) {
      throw new Error("Settings not loaded");
    }
    const transcript = await invoke<string>(
      "get_meeting_transcript_for_summary",
      { meetingId: id }
    );
    const summary = await generateMeetingSummary(transcript, settings);
    await invoke("save_meeting_summary", { meetingId: id, summary });
    const meeting = await invoke<Meeting>("get_meeting", { id });
    set({ selectedMeeting: meeting });
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
    await invoke("retranscribe_meeting", { meetingId: id });
    const meeting = await invoke<Meeting>("get_meeting", { id });
    const segments = await invoke<MeetingSegment[]>("get_meeting_segments", {
      meetingId: id,
    });
    set({ selectedMeeting: meeting, selectedSegments: segments });
  },
  selectedMeeting: null,
  selectedSegments: [],

  selectMeeting: async (id) => {
    const meeting = await invoke<Meeting>("get_meeting", { id });
    const segments = await invoke<MeetingSegment[]>("get_meeting_segments", {
      meetingId: id,
    });
    set({
      selectedMeeting: meeting,
      selectedSegments: segments,
      status: "viewing",
    });
  },
  setElapsedMs: (ms) => set({ elapsedMs: ms }),

  setStatus: (status) => set({ status }),

  startMeeting: async (title) => {
    const id = await invoke<number>("start_meeting", { title: title ?? null });
    set({
      batchProgress: {},
      currentMeetingId: id,
      elapsedMs: 0,
      interimSegments: emptyInterimSegments(),
      liveSegments: [],
      status: "recording",
      streamingFinals: [],
    });
    return id;
  },
  status: "idle",

  stopMeeting: async () => {
    set({ status: "processing" });
    // stop_meeting returns on capture stop; batch transcription completes via meeting-status-changed("complete").
    await invoke("stop_meeting");
  },
  streamingFinals: [],

  unselectMeeting: () => {
    set({
      selectedMeeting: null,
      selectedSegments: [],
      status: "idle",
    });
  },
}));

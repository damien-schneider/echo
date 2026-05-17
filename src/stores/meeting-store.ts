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
  // Actions
  addLiveSegment: (segment: MeetingSegment) => void;
  applyBatchProgress: (event: MeetingBatchProgress) => void;
  applyStreamingFinal: (event: StreamingFinal) => void;
  applyStreamingInterim: (event: StreamingInterim) => void;
  /// Per-source batch transcription progress, populated during processing.
  batchProgress: Record<string, MeetingBatchProgress | null>;
  // State
  currentMeetingId: number | null;
  deleteMeeting: (id: number) => Promise<void>;
  elapsedMs: number;
  exportMeeting: (id: number, format: ExportFormat) => Promise<string>;
  generateSummary: (id: number) => Promise<void>;
  /// In-progress interim text per audio source (mic, system).
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
  /// Streaming-finalized segments emitted during recording (separate from
  /// liveSegments which come from the post-meeting batch transcription).
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
  status: "idle",
  currentMeetingId: null,
  elapsedMs: 0,
  liveSegments: [],
  streamingFinals: [],
  interimSegments: emptyInterimSegments(),
  batchProgress: {},
  meetings: [],
  selectedMeeting: null,
  selectedSegments: [],

  setStatus: (status) => set({ status }),
  setElapsedMs: (ms) => set({ elapsedMs: ms }),

  startMeeting: async (title) => {
    const id = await invoke<number>("start_meeting", { title: title ?? null });
    set({
      status: "recording",
      currentMeetingId: id,
      elapsedMs: 0,
      liveSegments: [],
      streamingFinals: [],
      interimSegments: emptyInterimSegments(),
      batchProgress: {},
    });
    return id;
  },

  stopMeeting: async () => {
    set({ status: "processing" });
    // stop_meeting now returns as soon as audio capture has stopped — the
    // batch transcription runs in the background and notifies the front via
    // meeting-status-changed("complete"). The listener handles the final
    // state reset on that event so the processing UI stays visible until
    // batch decoding finishes.
    await invoke("stop_meeting");
  },

  addLiveSegment: (segment) => {
    set((state) => ({
      liveSegments: [...state.liveSegments, segment],
    }));
  },

  applyStreamingInterim: (event) => {
    set((state) => ({
      interimSegments: {
        ...state.interimSegments,
        [event.source]: {
          source: event.source,
          committedText: event.committed_text,
          tentativeText: event.tentative_text,
          segmentStartMs: event.segment_start_ms,
        },
      },
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
      // Append the final to streamingFinals as a synthetic MeetingSegment
      // (id=0 marks it as not-yet-persisted; the post-meeting batch pass will
      // create the canonical row).
      streamingFinals: [
        ...state.streamingFinals,
        {
          id: 0,
          meeting_id: event.meeting_id,
          speaker_label: event.source === "system" ? "System" : "Speaker",
          start_ms: event.start_ms,
          end_ms: event.end_ms,
          text: event.text,
          confidence: null,
          audio_source: event.source,
        },
      ],
      // Clear the interim slot for the source — its content is now in finals.
      interimSegments: {
        ...state.interimSegments,
        [event.source]: null,
      },
    }));
  },

  loadMeetings: async () => {
    const meetings = await invoke<Meeting[]>("list_meetings");
    set({ meetings });
  },

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

  unselectMeeting: () => {
    set({
      selectedMeeting: null,
      selectedSegments: [],
      status: "idle",
    });
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
    // Refresh the selected meeting to get the summary
    const meeting = await invoke<Meeting>("get_meeting", { id });
    set({ selectedMeeting: meeting });
  },

  exportMeeting: async (id, format) => {
    const content = await invoke<string>("export_meeting", { id, format });
    return content;
  },

  deleteMeeting: async (id) => {
    await invoke("delete_meeting", { id });
    const state = get();
    if (state.selectedMeeting?.id === id) {
      set({ selectedMeeting: null, selectedSegments: [], status: "idle" });
    }
    await state.loadMeetings();
  },

  renameSpeaker: async (meetingId, oldLabel, newLabel) => {
    await invoke("rename_meeting_speaker", {
      meetingId,
      oldLabel,
      newLabel,
    });
    // Refresh segments
    const segments = await invoke<MeetingSegment[]>("get_meeting_segments", {
      meetingId,
    });
    set({ selectedSegments: segments });
  },

  retranscribeMeeting: async (id) => {
    await invoke("retranscribe_meeting", { meetingId: id });
    // Refresh meeting and segments
    const meeting = await invoke<Meeting>("get_meeting", { id });
    const segments = await invoke<MeetingSegment[]>("get_meeting_segments", {
      meetingId: id,
    });
    set({ selectedMeeting: meeting, selectedSegments: segments });
  },
}));

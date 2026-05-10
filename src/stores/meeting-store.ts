import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { generateMeetingSummary } from "@/lib/llm/meeting-summary";
import type { ExportFormat, Meeting, MeetingSegment } from "@/lib/types";
import { useSettingsStore } from "@/stores/settings-store";

interface MeetingStore {
  // Actions
  addLiveSegment: (segment: MeetingSegment) => void;
  // State
  currentMeetingId: number | null;
  deleteMeeting: (id: number) => Promise<void>;
  elapsedMs: number;
  exportMeeting: (id: number, format: ExportFormat) => Promise<string>;
  generateSummary: (id: number) => Promise<void>;
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
  unselectMeeting: () => void;
}

export const useMeetingStore = create<MeetingStore>((set, get) => ({
  status: "idle",
  currentMeetingId: null,
  elapsedMs: 0,
  liveSegments: [],
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
    });
    return id;
  },

  stopMeeting: async () => {
    set({ status: "processing" });
    await invoke("stop_meeting");
    set({
      status: "idle",
      currentMeetingId: null,
      elapsedMs: 0,
      liveSegments: [],
    });
    // Refresh meetings list
    await get().loadMeetings();
  },

  addLiveSegment: (segment) => {
    set((state) => ({
      liveSegments: [...state.liveSegments, segment],
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

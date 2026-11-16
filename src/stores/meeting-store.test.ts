import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Meeting, MeetingSegment } from "@/lib/types";

const pastMeeting = (id: number): Meeting => ({
  id,
  start_time: 0,
  status: "complete",
  title: `Meeting ${id}`,
});

const unreadableMeetings = new Set<number>();

mock.module("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: { id?: number }) => {
    if (command !== "get_meeting") {
      return Promise.resolve([]);
    }
    const id = args?.id ?? 0;
    return unreadableMeetings.has(id)
      ? Promise.reject("Meeting not found")
      : Promise.resolve(pastMeeting(id));
  },
}));

// a static import would load the store before the Tauri mock exists
const { meetingPageView, useMeetingStore } = await import(
  "@/stores/meeting-store"
);

const segment = (meetingId: number): MeetingSegment => ({
  audio_source: "mic",
  confidence: null,
  end_ms: 1000,
  id: 1,
  meeting_id: meetingId,
  speaker_label: "Speaker 1",
  start_ms: 0,
  text: "hello",
});

const streamingFinal = (meetingId: number) => ({
  end_ms: 1000,
  meeting_id: meetingId,
  source: "mic" as const,
  start_ms: 0,
  text: "hello",
});

const store = () => useMeetingStore.getState();

const pageView = () => meetingPageView(store());

const backendStartsRecording = (meetingId: number) => {
  store().applyMeetingStatus("recording");
  store().applyActiveMeeting({
    meeting_id: meetingId,
    start_time: 0,
    state: "recording",
  });
};

beforeEach(() => {
  unreadableMeetings.clear();
  useMeetingStore.setState(useMeetingStore.getInitialState(), true);
});

describe("meeting store", () => {
  beforeEach(() => {
    backendStartsRecording(7);
  });

  // A retranscribe of an old meeting emits segments while another meeting records.
  it("ignores segments belonging to another meeting", () => {
    store().addLiveSegment(segment(99));
    store().applyStreamingFinal(streamingFinal(99));

    expect(store().liveSegments).toEqual([]);
    expect(store().streamingFinals).toEqual([]);
  });

  it("accepts segments of the meeting being recorded", () => {
    store().addLiveSegment(segment(7));

    expect(store().liveSegments).toHaveLength(1);
  });

  // Retranscribe and viewing a past meeting emit segments with no recording in flight.
  it("accepts segments when no meeting is being recorded", () => {
    useMeetingStore.setState({ currentMeetingId: null });

    store().addLiveSegment(segment(99));

    expect(store().liveSegments).toHaveLength(1);
  });
});

describe("meeting page while the backend records", () => {
  it("keeps the recording with its Stop button when the summary of the past meeting on screen lands", async () => {
    await store().selectMeeting(1);
    expect(pageView()).toBe("detail");

    backendStartsRecording(2);
    await store().applySummaryGenerated(1);

    expect(pageView()).toBe("live");
  });

  it("keeps the recording with its Stop button when the user goes back from a past meeting", async () => {
    await store().selectMeeting(1);

    backendStartsRecording(2);
    store().unselectMeeting();

    expect(pageView()).toBe("live");
  });

  it("keeps the recording with its Stop button when the past meeting on screen is deleted", async () => {
    await store().selectMeeting(1);

    backendStartsRecording(2);
    await store().deleteMeeting(1);

    expect(pageView()).toBe("live");
  });

  it("keeps a recording that starts while the meeting that just ended is still loading", async () => {
    backendStartsRecording(1);

    const ended = store().applyMeetingStatus("complete");
    backendStartsRecording(2);
    await ended;

    expect(pageView()).toBe("live");
  });

  it("opens the meeting that just ended once nothing is recording", async () => {
    backendStartsRecording(1);

    await store().applyMeetingStatus("complete");

    expect(pageView()).toBe("detail");
    expect(store().selectedMeeting?.id).toBe(1);
  });
});

describe("opening a past meeting", () => {
  it("shows the meeting once it has loaded", async () => {
    await store().selectMeeting(1);

    expect(pageView()).toBe("detail");
    expect(store().selectedMeeting?.title).toBe("Meeting 1");
  });

  it("stays on the list when the user goes back before the meeting has loaded", async () => {
    const opening = store().selectMeeting(1);
    store().unselectMeeting();
    await opening;

    expect(pageView()).toBe("list");
  });

  it("returns to the list when the meeting on screen is deleted", async () => {
    await store().selectMeeting(1);

    await store().deleteMeeting(1);

    expect(pageView()).toBe("list");
  });

  it("stays on the list when the summary of a meeting that failed to open lands", async () => {
    unreadableMeetings.add(3);
    const opening = store().selectMeeting(3);
    await expect(opening).rejects.toBe("Meeting not found");
    unreadableMeetings.clear();

    await store().applySummaryGenerated(3);

    expect(pageView()).toBe("list");
  });

  it("stays on the list when the summary of a meeting the user left lands", async () => {
    await store().selectMeeting(1);
    store().unselectMeeting();

    await store().applySummaryGenerated(1);

    expect(pageView()).toBe("list");
  });
});

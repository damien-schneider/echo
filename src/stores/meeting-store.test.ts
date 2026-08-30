import { beforeEach, describe, expect, it } from "bun:test";
import type { MeetingSegment } from "@/lib/types";
import { useMeetingStore } from "@/stores/meeting-store";

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

beforeEach(() => {
  useMeetingStore.setState({
    currentMeetingId: 7,
    interimSegments: { mic: null, system: null },
    liveSegments: [],
    status: "recording",
    streamingFinals: [],
  });
});

describe("meeting store", () => {
  // Batch rows are canonical: keeping the live preview showed every sentence twice.
  it("drops the live preview once the batch pass takes over", () => {
    useMeetingStore.getState().applyStreamingFinal(streamingFinal(7));
    useMeetingStore.getState().applyStreamingInterim({
      committed_text: "half a ",
      meeting_id: 7,
      segment_start_ms: 1000,
      source: "mic",
      tentative_text: "sentence",
    });

    useMeetingStore.getState().setStatus("processing");

    expect(useMeetingStore.getState().streamingFinals).toEqual([]);
    expect(useMeetingStore.getState().interimSegments.mic).toBeNull();
  });

  // A retranscribe of an old meeting emits segments while another meeting records.
  it("ignores segments belonging to another meeting", () => {
    useMeetingStore.getState().addLiveSegment(segment(99));
    useMeetingStore.getState().applyStreamingFinal(streamingFinal(99));

    expect(useMeetingStore.getState().liveSegments).toEqual([]);
    expect(useMeetingStore.getState().streamingFinals).toEqual([]);
  });

  it("accepts segments of the meeting being recorded", () => {
    useMeetingStore.getState().addLiveSegment(segment(7));

    expect(useMeetingStore.getState().liveSegments).toHaveLength(1);
  });

  // Retranscribe and viewing a past meeting emit segments with no recording in flight.
  it("accepts segments when no meeting is being recorded", () => {
    useMeetingStore.setState({ currentMeetingId: null });

    useMeetingStore.getState().addLiveSegment(segment(99));

    expect(useMeetingStore.getState().liveSegments).toHaveLength(1);
  });
});

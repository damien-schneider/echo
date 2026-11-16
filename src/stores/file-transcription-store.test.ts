import { beforeEach, describe, expect, it } from "bun:test";
import { useFileTranscriptionStore } from "@/stores/file-transcription-store";

const store = () => useFileTranscriptionStore.getState();

const rows = () => store().items;

const rowOf = (jobId: number) =>
  rows().find((item) => item.id === String(jobId));

const progressOf = (jobId: number, fileName = `file-${jobId}.mp3`) => ({
  fileName,
  jobId,
  message: "Transcribing 10s of audio...",
  progress: -1,
  status: "transcribing",
});

const completionOf = (jobId: number, warning: string | null = null) => ({
  fileName: `file-${jobId}.mp3`,
  jobId,
  text: `transcript of job ${jobId}`,
  warning,
});

const failureOf = (jobId: number) => ({
  fileName: `file-${jobId}.mp3`,
  jobId,
  message: "No speech detected in the audio",
});

beforeEach(() => {
  useFileTranscriptionStore.setState({ items: [], latestJobId: 0 });
});

describe("a file job in the transcription center", () => {
  it("appears with its file name when its first event arrives", () => {
    store().applyProgress(progressOf(1, "interview.mp3"));

    expect(rows()).toHaveLength(1);
    expect(rowOf(1)?.fileName).toBe("interview.mp3");
    expect(rowOf(1)?.status).toBe("transcribing");
  });

  it("keeps one row while its progress changes", () => {
    store().applyProgress({ ...progressOf(1), status: "decoding" });
    store().applyProgress(progressOf(1));
    store().applyProgress({ ...progressOf(1), status: "saving" });

    expect(rows()).toHaveLength(1);
    expect(rowOf(1)?.status).toBe("processing");
  });

  it("shows its transcript once it completes", () => {
    store().applyProgress(progressOf(1));
    store().applyCompletion(completionOf(1));

    expect(rowOf(1)?.status).toBe("complete");
    expect(rowOf(1)?.text).toBe("transcript of job 1");
  });

  it("stays complete and says so when the transcript was not saved to history", () => {
    store().applyProgress(progressOf(1));
    store().applyCompletion(completionOf(1, "not saved to history"));

    expect(rowOf(1)?.status).toBe("complete");
    expect(rowOf(1)?.text).toBe("transcript of job 1");
    expect(rowOf(1)?.error).toBe("not saved to history");
  });

  it("shows a single failed row when it fails", () => {
    store().applyProgress(progressOf(1));
    store().applyFailure(failureOf(1));

    expect(rows()).toHaveLength(1);
    expect(rowOf(1)?.status).toBe("error");
    expect(rowOf(1)?.error).toBe("No speech detected in the audio");
  });

  it("shows a failed row when it fails before reporting any progress", () => {
    store().applyFailure(failureOf(1));

    expect(rowOf(1)?.status).toBe("error");
    expect(rowOf(1)?.fileName).toBe("file-1.mp3");
  });
});

describe("events from a job that is no longer the current one", () => {
  it("leave the current job untouched when the earlier job reports late", () => {
    store().applyProgress(progressOf(1));
    store().applyCompletion(completionOf(1));
    store().applyProgress(progressOf(2));

    store().applyFailure(failureOf(1));
    store().applyCompletion(completionOf(1));

    expect(rowOf(2)?.status).toBe("transcribing");
    expect(rowOf(2)?.text).toBeUndefined();
    expect(rowOf(2)?.fileName).toBe("file-2.mp3");
  });

  it("do not reopen a job that already completed", () => {
    store().applyProgress(progressOf(1));
    store().applyCompletion(completionOf(1));

    store().applyProgress(progressOf(1));
    store().applyFailure(failureOf(1));

    expect(rowOf(1)?.status).toBe("complete");
    expect(rowOf(1)?.text).toBe("transcript of job 1");
  });

  it("do not turn a failed job into a completed one", () => {
    store().applyProgress(progressOf(1));
    store().applyFailure(failureOf(1));

    store().applyCompletion(completionOf(1));

    expect(rowOf(1)?.status).toBe("error");
    expect(rowOf(1)?.text).toBeUndefined();
  });

  it("do not bring back a row the user dismissed", () => {
    store().applyProgress(progressOf(1));
    store().removeItem("1");

    store().applyProgress(progressOf(1));
    store().applyCompletion(completionOf(1));

    expect(rows()).toHaveLength(0);
  });

  it("do not add a row for an earlier job after a newer one started", () => {
    store().applyProgress(progressOf(2));

    store().applyProgress(progressOf(1));

    expect(rows()).toHaveLength(1);
    expect(rowOf(1)).toBeUndefined();
  });
});

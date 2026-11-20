import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { toast } from "sonner";
import type { HistoryEntry } from "@/components/settings/history/history-entry-component";
import { mockExports } from "@/test/mock-exports";

const backend: { failure: unknown; rows: unknown[] } = {
  failure: null,
  rows: [],
};

await mockExports("@tauri-apps/api/core", {
  invoke: () =>
    backend.failure === null
      ? Promise.resolve(backend.rows)
      : Promise.reject(backend.failure),
});

// a static import would load the actions before the Tauri mock exists
const actions = await import("@/components/settings/history/history-actions");

const failingActions: [string, () => Promise<boolean>][] = [
  ["retranscribe", () => actions.retranscribeEntry(1)],
  ["delete", () => actions.deleteHistoryEntry(1)],
  ["star toggle", () => actions.toggleSaved(1)],
  ["recordings folder open", () => actions.openRecordingsFolder()],
  ["keyboard input delete", () => actions.deleteInputEntry(1)],
  ["keyboard inputs clear", () => actions.clearInputEntries()],
];

let shownErrors: string[] = [];

beforeEach(() => {
  backend.failure = null;
  backend.rows = [];
  shownErrors = [];
  spyOn(toast, "error").mockImplementation((message) => {
    shownErrors.push(String(message));
    return 0;
  });
});

afterEach(() => {
  mock.restore();
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("history actions", () => {
  for (const [name, run] of failingActions) {
    it(`a failed ${name} tells the user the backend's reason`, async () => {
      backend.failure = "Failed to load audio file: echo-1.wav is gone";

      const succeeded = await run();

      expect(succeeded).toBe(false);
      expect(shownErrors).toEqual([
        "Failed to load audio file: echo-1.wav is gone",
      ]);
    });
  }

  it("a failure the backend does not explain still tells the user what to do", async () => {
    backend.failure = { code: 5 };

    await actions.deleteHistoryEntry(1);

    expect(shownErrors).toEqual(["Couldn't delete the entry — try again"]);
  });

  it("an action that works shows no error", async () => {
    const succeeded = await actions.retranscribeEntry(1);

    expect(succeeded).toBe(true);
    expect(shownErrors).toEqual([]);
  });

  it("a copy the system refuses tells the user and is not shown as copied", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });

    const copied = await actions.copyText("hello");

    expect(copied).toBe(false);
    expect(shownErrors).toEqual(["Couldn't copy the text — try again"]);
  });
});

describe("loading the history", () => {
  it("reports a failed load with the backend's reason instead of an empty history", async () => {
    backend.failure = "database is locked";

    expect(await actions.loadHistory()).toEqual({
      message: "database is locked",
      status: "failed",
    });
    expect(await actions.loadInputEntries()).toEqual({
      message: "database is locked",
      status: "failed",
    });
  });

  it("gives the entries when the load works", async () => {
    const entry: HistoryEntry = {
      file_name: "echo-1.wav",
      id: 1,
      saved: false,
      timestamp: 0,
      title: "Note",
      transcription_text: "hello",
    };
    backend.rows = [entry];

    expect(await actions.loadHistory()).toEqual({
      entries: [entry],
      status: "loaded",
    });
  });
});

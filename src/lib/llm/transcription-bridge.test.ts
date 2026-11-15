import { beforeEach, describe, expect, it, mock } from "bun:test";

interface InvokeCall {
  args: Record<string, unknown>;
  command: string;
}

const invokeCalls: InvokeCall[] = [];
let rewriteReply: unknown = null;
let deliverTranscriptionReady: (payload: unknown) => Promise<void> = () =>
  Promise.resolve();

mock.module("@tauri-apps/api/core", () => ({
  invoke: (command: string, args: Record<string, unknown>) => {
    invokeCalls.push({ args, command });
    if (command === "rewrite_dictation") {
      return rewriteReply instanceof Error
        ? Promise.reject(rewriteReply)
        : Promise.resolve(rewriteReply);
    }
    return Promise.resolve(null);
  },
}));

mock.module("@tauri-apps/api/event", () => ({
  listen: (
    _event: string,
    handler: (event: { payload: unknown }) => Promise<void>
  ) => {
    deliverTranscriptionReady = (payload) => handler({ payload });
    return Promise.resolve(() => undefined);
  },
}));

const { mountTranscriptionBridge } = await import(
  "@/lib/llm/transcription-bridge"
);

const dictationReady = {
  op_generation: 7,
  pass: "rewrite",
  post_process_timeout_ms: 27_000,
  transcription: "bonjour tout le monde",
};

const finalized = () =>
  invokeCalls.find((call) => call.command === "finalize_transcription")?.args;

describe("dictation rewrite", () => {
  beforeEach(async () => {
    invokeCalls.length = 0;
    await mountTranscriptionBridge();
  });

  it("pastes the rewrite from the dictation prompt and records its name", async () => {
    rewriteReply = { prompt_name: "Translate", text: "hello everyone" };

    await deliverTranscriptionReady(dictationReady);

    expect(invokeCalls[0]).toEqual({
      args: { text: "bonjour tout le monde" },
      command: "rewrite_dictation",
    });
    expect(finalized()).toMatchObject({
      kind: "text",
      originalTranscription: "bonjour tout le monde",
      postProcessPrompt: "Translate",
      text: "hello everyone",
    });
  });

  it("pastes the raw transcript when no dictation prompt is set", async () => {
    rewriteReply = null;

    await deliverTranscriptionReady(dictationReady);

    expect(finalized()).toMatchObject({
      kind: "empty",
      postProcessPrompt: null,
      text: "bonjour tout le monde",
    });
  });

  it("pastes the raw transcript when the rewrite fails", async () => {
    rewriteReply = new Error("Prompt response is empty");

    await deliverTranscriptionReady(dictationReady);

    expect(finalized()).toMatchObject({
      kind: "empty",
      postProcessPrompt: null,
      text: "bonjour tout le monde",
    });
  });
});

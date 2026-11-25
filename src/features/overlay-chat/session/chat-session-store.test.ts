import { beforeEach, describe, expect, test } from "bun:test";
import {
  updateAssistantMessage,
  visibleMessages,
  withDictationPreview,
} from "@/features/overlay-chat/chat";
import {
  type ChatRequestHandle,
  changeChatDictation,
  changeChatSession,
  changeChatSessionFromRequest,
  chatEdgeFor,
  chatSessionFor,
  failedTurn,
  hearChatDictation,
  holdChatSession,
  pendingQuestionIsDue,
  restartChatSession,
  startedTurn,
  useChatSessionStore,
} from "@/features/overlay-chat/session/chat-session-store";

const sessionOf = (generation: number) =>
  chatSessionFor(useChatSessionStore.getState(), generation);

interface StreamingTurn {
  assistantId: string;
  handle: ChatRequestHandle;
}

const startTurn = (
  generation: number,
  question: string | null
): StreamingTurn => {
  const controller = new AbortController();
  const handle = { controller, generation, thinking: false };
  const assistantId = `answer-${sessionOf(generation).messages.length}`;
  changeChatSession(generation, (current) =>
    startedTurn(current, { assistantId, question, request: handle })
  );
  return { assistantId, handle };
};

const answer = (turn: StreamingTurn, text: string) =>
  changeChatSessionFromRequest(turn.handle, (current) => ({
    messages: updateAssistantMessage(current.messages, turn.assistantId, text),
  }));

const fail = (turn: StreamingTurn, question: string | null) =>
  changeChatSessionFromRequest(turn.handle, (current) =>
    failedTurn(current, {
      assistantId: turn.assistantId,
      message: "The local model failed to start",
      question,
    })
  );

beforeEach(() => {
  useChatSessionStore.setState({
    dictation: "idle",
    dictationPreview: "",
    open: null,
    thinking: false,
  });
});

describe("a chat covered by another surface", () => {
  test("keeps its conversation and does not re-run the saved prompt", async () => {
    const releasePanel = holdChatSession(1);
    const turn = startTurn(1, null);
    changeChatSession(1, () => ({ isPromptRunArmed: false }));
    answer(turn, "Une affaire");

    const releaseWarning = holdChatSession(1);
    releasePanel();
    await Promise.resolve();

    expect(sessionOf(1).isPromptRunArmed).toBe(false);
    expect(
      visibleMessages(sessionOf(1).messages).map((message) => message.content)
    ).toEqual(["Une affaire"]);
    expect(turn.handle.controller.signal.aborted).toBe(false);

    releaseWarning();
    await Promise.resolve();
  });

  test("survives a surface that leaves before its replacement arrives", async () => {
    const releasePanel = holdChatSession(1);
    startTurn(1, "What does this mean?");

    releasePanel();
    const releaseWarning = holdChatSession(1);
    await Promise.resolve();

    expect(sessionOf(1).messages).toHaveLength(2);

    releaseWarning();
    await Promise.resolve();
  });

  test("ends and stops its answer once nothing shows it any more", async () => {
    const release = holdChatSession(1);
    const turn = startTurn(1, "What does this mean?");

    release();
    await Promise.resolve();

    expect(useChatSessionStore.getState().open).toBeNull();
    expect(turn.handle.controller.signal.aborted).toBe(true);
  });
});

describe("a new chat request", () => {
  test("starts empty and stops the answer of the chat it replaces", () => {
    const previous = startTurn(1, "Old question");

    changeChatSession(2, () => ({ input: "New question" }));

    expect(sessionOf(2).messages).toEqual([]);
    expect(sessionOf(2).isPromptRunArmed).toBe(true);
    expect(previous.handle.controller.signal.aborted).toBe(true);
  });

  test("is not overwritten by the chat it replaced", () => {
    const previous = startTurn(1, "Old question");
    changeChatSession(2, () => ({ input: "New question" }));

    changeChatSession(1, () => ({ error: "Late failure" }));
    answer(previous, "Late answer");

    expect(sessionOf(2).error).toBe("");
    expect(sessionOf(2).input).toBe("New question");
    expect(sessionOf(2).messages).toEqual([]);
  });
});

describe("switching prompt while an answer streams", () => {
  test("starts over but keeps what is typed", () => {
    changeChatSession(1, () => ({ input: "half a thought" }));
    const turn = startTurn(1, null);
    changeChatSession(1, () => ({ isPromptRunArmed: false }));

    restartChatSession(1);

    expect(turn.handle.controller.signal.aborted).toBe(true);
    expect(sessionOf(1).messages).toEqual([]);
    expect(sessionOf(1).isPromptRunArmed).toBe(true);
    expect(sessionOf(1).input).toBe("half a thought");
  });

  test("leaves the new answer stoppable when the old request settles", () => {
    const first = startTurn(1, null);
    restartChatSession(1);
    const second = startTurn(1, null);

    fail(first, null);
    changeChatSessionFromRequest(first.handle, () => ({ request: null }));

    expect(sessionOf(1).request).toBe(second.handle);
    expect(sessionOf(1).error).toBe("");
    expect(sessionOf(1).messages).toHaveLength(2);
  });
});

describe("a question that fails", () => {
  test("returns to the composer and leaves no unanswered turn", () => {
    const turn = startTurn(1, "What does this mean?");

    fail(turn, "What does this mean?");

    expect(sessionOf(1).error).toBe("The local model failed to start");
    expect(sessionOf(1).input).toBe("What does this mean?");
    expect(sessionOf(1).messages).toEqual([]);
  });

  test("does not replace what was typed while waiting", () => {
    const turn = startTurn(1, "What does this mean?");
    changeChatSession(1, () => ({ input: "Something newer" }));

    fail(turn, "What does this mean?");

    expect(sessionOf(1).input).toBe("Something newer");
  });

  test("keeps a partial answer with the question it belongs to", () => {
    const turn = startTurn(1, "What does this mean?");
    answer(turn, "Half an ans");

    fail(turn, "What does this mean?");

    expect(sessionOf(1).messages).toHaveLength(2);
    expect(sessionOf(1).input).toBe("");
  });

  test("leaves the composer alone when it was a prompt run", () => {
    const turn = startTurn(1, null);

    fail(turn, null);

    expect(sessionOf(1).input).toBe("");
    expect(sessionOf(1).messages).toEqual([]);
  });
});

describe("a question handed over from dictation", () => {
  test("waits for a cold model instead of being dropped", () => {
    changeChatSession(1, () => ({
      input: "What is this?",
      isQuestionPending: true,
    }));

    expect(
      pendingQuestionIsDue({
        contextState: "ready",
        modelState: "loading",
        session: sessionOf(1),
      })
    ).toBe(false);
    expect(
      pendingQuestionIsDue({
        contextState: "ready",
        modelState: "ready",
        session: sessionOf(1),
      })
    ).toBe(true);
  });

  test("waits for the answer that is already streaming", () => {
    changeChatSession(1, () => ({
      input: "What is this?",
      isQuestionPending: true,
    }));
    const promptRun = startTurn(1, null);

    expect(
      pendingQuestionIsDue({
        contextState: "ready",
        modelState: "ready",
        session: sessionOf(1),
      })
    ).toBe(false);

    changeChatSessionFromRequest(promptRun.handle, () => ({ request: null }));

    expect(
      pendingQuestionIsDue({
        contextState: "ready",
        modelState: "ready",
        session: sessionOf(1),
      })
    ).toBe(true);
  });

  test("is asked once", () => {
    changeChatSession(1, () => ({
      input: "What is this?",
      isQuestionPending: true,
    }));

    startTurn(1, "What is this?");

    expect(sessionOf(1).isQuestionPending).toBe(false);
    expect(sessionOf(1).input).toBe("");
  });
});

describe("the island edge around a chat", () => {
  const edgeOf = (
    generation: number,
    modelState: Parameters<typeof chatEdgeFor>[0]["modelState"]
  ) =>
    chatEdgeFor({
      generation,
      modelState,
      store: useChatSessionStore.getState(),
    });

  test("follows the voice while a message is dictated, even over a streaming answer", () => {
    startTurn(1, "What is this?");
    useChatSessionStore.setState({ dictation: "recording" });

    expect(edgeOf(1, "ready")).toBe("voice");
  });

  test("keeps following the voice when a newer chat replaces the one being dictated into", () => {
    startTurn(1, "What is this?");
    useChatSessionStore.setState({ dictation: "recording" });
    changeChatSession(2, () => ({ input: "" }));

    expect(edgeOf(2, "ready")).toBe("voice");
  });

  test("pulses like a voice while Echo works: transcribing, answering or readying the model", () => {
    useChatSessionStore.setState({ dictation: "transcribing" });
    expect(edgeOf(1, "ready")).toBe("pulse");

    useChatSessionStore.setState({ dictation: "idle" });
    const turn = startTurn(1, "What is this?");
    expect(edgeOf(1, "ready")).toBe("pulse");

    changeChatSessionFromRequest(turn.handle, () => ({ request: null }));
    expect(edgeOf(1, "downloading")).toBe("pulse");
    expect(edgeOf(1, "loading")).toBe("pulse");
  });

  test("rests while the chat waits on the user", () => {
    expect(edgeOf(1, "ready")).toBeNull();
    expect(edgeOf(1, "not_downloaded")).toBeNull();
    expect(edgeOf(1, "repair")).toBeNull();
  });
});

const boxOf = (generation: number) =>
  withDictationPreview(
    sessionOf(generation).input,
    useChatSessionStore.getState().dictationPreview
  );

describe("the message box while a message is dictated", () => {
  test("shows the words heard so far after what is typed", () => {
    changeChatSession(1, () => ({ input: "Summarize" }));
    changeChatDictation("recording");
    hearChatDictation("in two lines");

    expect(boxOf(1)).toBe("Summarize in two lines");
  });

  test("keeps the heard words while the transcript is made", () => {
    changeChatDictation("recording");
    hearChatDictation("in two lines");
    changeChatDictation("transcribing");

    expect(boxOf(1)).toBe("in two lines");
  });

  test("starts the next dictation without the words of the previous one", () => {
    changeChatDictation("recording");
    hearChatDictation("first thought");
    changeChatDictation("idle");
    changeChatDictation("recording");

    expect(boxOf(1)).toBe("");
  });

  test("ignores words dictated into another app while the chat is open", () => {
    changeChatSession(1, () => ({ input: "Draft" }));
    hearChatDictation("meant for the editor");

    expect(boxOf(1)).toBe("Draft");
  });
});

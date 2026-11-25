import { create } from "zustand";
import {
  type ChatMessage,
  withoutUnansweredTurn,
  withPendingTurn,
  withPromptRun,
} from "@/features/overlay-chat/chat";
import type { IslandEdge } from "@/features/overlay-controls/recording-overlay-state";
import type { ChatContextEvent } from "@/features/overlay-controls/runtime/overlay-windows";
import type { PolishStatus } from "@/lib/types";

export type ChatDictationState = "idle" | "recording" | "transcribing";

export interface ChatSessionState {
  error: string;
  input: string;
  isPromptRunArmed: boolean;
  isQuestionPending: boolean;
  messages: ChatMessage[];
  request: ChatRequestHandle | null;
}

const FRESH_CHAT_SESSION: ChatSessionState = {
  error: "",
  input: "",
  isPromptRunArmed: true,
  isQuestionPending: false,
  messages: [],
  request: null,
};

/// One microphone per window: dictation outlives the chat it started in. Think likewise stays on until turned off.
interface ChatSessionStore {
  dictation: ChatDictationState;
  dictationPreview: string;
  open: { generation: number; session: ChatSessionState } | null;
  thinking: boolean;
}

export const useChatSessionStore = create<ChatSessionStore>(() => ({
  dictation: "idle",
  dictationPreview: "",
  open: null,
  thinking: false,
}));

export const chooseThinking = (thinking: boolean) =>
  useChatSessionStore.setState({ thinking });

/// Heard words belong to one dictation: they outlast the stop while the transcript is made, never the next start.
export const changeChatDictation = (dictation: ChatDictationState) =>
  useChatSessionStore.setState((store) => ({
    dictation,
    dictationPreview:
      dictation === "transcribing" ? store.dictationPreview : "",
  }));

/// The microphone may be dictating elsewhere; only the chat's own dictation previews here.
export const hearChatDictation = (preview: string) =>
  useChatSessionStore.setState((store) =>
    store.dictation === "idle" ? store : { dictationPreview: preview }
  );

/// Keyed by the chat request, so a panel that remounts finds its conversation and a new chat starts empty.
export const chatSessionFor = (
  store: ChatSessionStore,
  generation: number
): ChatSessionState =>
  store.open?.generation === generation
    ? store.open.session
    : FRESH_CHAT_SESSION;

export type ChatSessionChange = (
  session: ChatSessionState
) => Partial<ChatSessionState>;

/// A newer chat replaces the open one and stops its stream; an older chat can no longer write.
export const changeChatSession = (
  generation: number,
  change: ChatSessionChange
) => {
  const store = useChatSessionStore.getState();
  if (store.open !== null && generation < store.open.generation) {
    return;
  }
  if (store.open !== null && generation > store.open.generation) {
    store.open.session.request?.controller.abort();
  }
  const session = chatSessionFor(store, generation);
  useChatSessionStore.setState({
    open: { generation, session: { ...session, ...change(session) } },
  });
};

/// Switching prompt starts over, keeping the composer draft.
export const restartChatSession = (generation: number) => {
  const session = chatSessionFor(useChatSessionStore.getState(), generation);
  session.request?.controller.abort();
  changeChatSession(generation, () => ({
    error: "",
    isPromptRunArmed: true,
    messages: [],
    request: null,
  }));
};

export interface ChatRequestHandle {
  controller: AbortController;
  generation: number;
  thinking: boolean;
}

/// Only the live request writes — a superseded one must not touch what replaced it.
export const changeChatSessionFromRequest = (
  handle: ChatRequestHandle,
  change: ChatSessionChange
) => {
  const { open } = useChatSessionStore.getState();
  if (
    open?.generation !== handle.generation ||
    open.session.request !== handle
  ) {
    return;
  }
  changeChatSession(handle.generation, change);
};

const sessionHolders = new Map<number, number>();

const closeUnheldChatSession = (generation: number) => {
  const { open } = useChatSessionStore.getState();
  if (sessionHolders.has(generation) || open?.generation !== generation) {
    return;
  }
  open.session.request?.controller.abort();
  useChatSessionStore.setState({ open: null });
};

/// Every surface showing a chat request holds its session; the last one to leave ends it.
export const holdChatSession = (generation: number) => {
  sessionHolders.set(generation, (sessionHolders.get(generation) ?? 0) + 1);
  return () => {
    const remaining = (sessionHolders.get(generation) ?? 1) - 1;
    if (remaining > 0) {
      sessionHolders.set(generation, remaining);
      return;
    }
    sessionHolders.delete(generation);
    // an outgoing surface may release before its replacement holds
    queueMicrotask(() => closeUnheldChatSession(generation));
  };
};

interface StartedTurn {
  assistantId: string;
  /// `null` runs the active prompt on the reference instead of asking.
  question: string | null;
  request: ChatRequestHandle;
}

export const startedTurn = (
  session: ChatSessionState,
  turn: StartedTurn
): ChatSessionState => {
  const started = { ...session, error: "", request: turn.request };
  if (turn.question === null) {
    return {
      ...started,
      messages: withPromptRun(session.messages, turn.assistantId),
    };
  }
  return {
    ...started,
    input: "",
    isQuestionPending: false,
    messages: withPendingTurn(
      session.messages,
      turn.question,
      turn.assistantId
    ),
  };
};

interface FailedTurn {
  assistantId: string;
  message: string;
  question: string | null;
}

/// The question goes back to the composer unless something newer was typed there.
export const failedTurn = (
  session: ChatSessionState,
  turn: FailedTurn
): Partial<ChatSessionState> => {
  const messages = withoutUnansweredTurn(session.messages, turn.assistantId);
  const wasUnanswered = messages.length < session.messages.length;
  const restoredDraft =
    wasUnanswered && session.input === "" ? turn.question : null;
  return {
    error: turn.message,
    input: restoredDraft ?? session.input,
    messages,
  };
};

interface PendingQuestionGate {
  contextState: ChatContextEvent["state"];
  modelState: PolishStatus["state"];
  session: ChatSessionState;
}

/// A transcript handed over whole goes out once its reference is known and the model can take it.
export const pendingQuestionIsDue = ({
  contextState,
  modelState,
  session,
}: PendingQuestionGate) =>
  session.isQuestionPending &&
  session.request === null &&
  contextState !== "loading" &&
  modelState === "ready";

const IS_MODEL_GETTING_READY: Record<PolishStatus["state"], boolean> = {
  downloading: true,
  loading: true,
  not_downloaded: false,
  preparing: true,
  ready: false,
  repair: false,
  verifying: true,
};

interface ChatEdgeInputs {
  generation: number;
  modelState: PolishStatus["state"];
  store: ChatSessionStore;
}

export const chatEdgeFor = ({
  generation,
  modelState,
  store,
}: ChatEdgeInputs): IslandEdge | null => {
  if (store.dictation === "recording") {
    return "voice";
  }
  const isWorking =
    store.dictation === "transcribing" ||
    chatSessionFor(store, generation).request !== null ||
    IS_MODEL_GETTING_READY[modelState];
  return isWorking ? "pulse" : null;
};

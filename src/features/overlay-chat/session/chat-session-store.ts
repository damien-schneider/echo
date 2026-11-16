import { create } from "zustand";
import {
  type ChatMessage,
  withoutUnansweredTurn,
  withPendingTurn,
  withPromptRun,
} from "@/features/overlay-chat/chat";
import type { ChatContextEvent } from "@/features/overlay-controls/runtime/overlay-windows";
import type { PolishStatus } from "@/lib/types";

export interface ChatSessionState {
  error: string;
  input: string;
  isPromptRunArmed: boolean;
  isQuestionPending: boolean;
  messages: ChatMessage[];
  request: AbortController | null;
}

const FRESH_CHAT_SESSION: ChatSessionState = {
  error: "",
  input: "",
  isPromptRunArmed: true,
  isQuestionPending: false,
  messages: [],
  request: null,
};

interface ChatSessionStore {
  open: { generation: number; session: ChatSessionState } | null;
}

export const useChatSessionStore = create<ChatSessionStore>(() => ({
  open: null,
}));

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
    store.open.session.request?.abort();
  }
  const session = chatSessionFor(store, generation);
  useChatSessionStore.setState({
    open: { generation, session: { ...session, ...change(session) } },
  });
};

/// Switching prompt starts over, keeping only what is typed.
export const restartChatSession = (generation: number) => {
  chatSessionFor(useChatSessionStore.getState(), generation).request?.abort();
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
}

/// Only the live request writes — a superseded one must not touch what replaced it.
export const changeChatSessionFromRequest = (
  handle: ChatRequestHandle,
  change: ChatSessionChange
) => {
  const { open } = useChatSessionStore.getState();
  if (
    open?.generation !== handle.generation ||
    open.session.request !== handle.controller
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
  open.session.request?.abort();
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
  controller: AbortController;
  /// `null` runs the active prompt on the reference instead of asking.
  question: string | null;
}

export const startedTurn = (
  session: ChatSessionState,
  turn: StartedTurn
): ChatSessionState => {
  const started = { ...session, error: "", request: turn.controller };
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

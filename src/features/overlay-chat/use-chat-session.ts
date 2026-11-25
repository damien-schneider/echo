import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { type RefObject, useEffect, useEffectEvent, useRef } from "react";
import {
  buildChatSystemPrompt,
  CHAT_ANSWER_EVENT,
  ChatAnswerEventSchema,
  type ChatMessage,
  type ChatPrompt,
  chatFailureMessage,
  chatModelBlock,
  dropEmptyAssistantTurn,
  makeMessageId,
  promptMessages,
  updateAssistantMessage,
  withDictatedText,
} from "@/features/overlay-chat/chat";
import { usePromptAutoRun } from "@/features/overlay-chat/prompt-picker/use-prompt-auto-run";
import {
  type ChatRequestHandle,
  type ChatSessionChange,
  changeChatDictation,
  changeChatSession,
  changeChatSessionFromRequest,
  chatEdgeFor,
  chatSessionFor,
  chooseThinking,
  failedTurn,
  hearChatDictation,
  holdChatSession,
  pendingQuestionIsDue,
  restartChatSession,
  startedTurn,
  useChatSessionStore,
} from "@/features/overlay-chat/session/chat-session-store";
import {
  type ChatDictation,
  useChatDictation,
} from "@/features/overlay-chat/use-chat-dictation";
import type {
  ChatContextEvent,
  ChatTextContext,
} from "@/features/overlay-controls/runtime/overlay-windows";
import type { PolishStatus } from "@/lib/types";

const abortable = <T>(operation: Promise<T>, signal: AbortSignal): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const handleAbort = () =>
      reject(signal.reason ?? new Error("Chat request cancelled"));
    if (signal.aborted) {
      handleAbort();
      return;
    }
    signal.addEventListener("abort", handleAbort, { once: true });
    operation.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", handleAbort);
    });
  });

interface ChatSessionOptions {
  context: ChatTextContext | null;
  contextState: ChatContextEvent["state"];
  generation: number;
  isPromptReady: boolean;
  modelStatus: PolishStatus;
  prompt: ChatPrompt | null;
}

export interface ChatSession {
  dictation: ChatDictation;
  error: string;
  input: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  isResponding: boolean;
  isThinking: boolean;
  messages: ChatMessage[];
  restart: () => void;
  send: () => void;
  setInput: (value: string) => void;
  showError: (message: string) => void;
  stop: () => void;
  thinkingMode: {
    selected: boolean;
    setSelected: (selected: boolean) => void;
  } | null;
}

interface AssistantStreamOptions {
  assistantId: string;
  context: ChatTextContext | null;
  handle: ChatRequestHandle;
  messages: ChatMessage[];
  modelId?: string;
  prompt: ChatPrompt | null;
}

const requestBundledResponse = async (options: AssistantStreamOptions) => {
  const showAnswer = (answer: string) =>
    changeChatSessionFromRequest(options.handle, (session) => ({
      messages: updateAssistantMessage(
        session.messages,
        options.assistantId,
        answer
      ),
    }));
  const stopListening = await listen<unknown>(CHAT_ANSWER_EVENT, (event) => {
    const published = ChatAnswerEventSchema.safeParse(event.payload);
    if (published.success && published.data.stream_id === options.assistantId) {
      showAnswer(published.data.answer);
    }
  });
  const { signal } = options.handle.controller;
  try {
    const answer = await abortable(
      invoke<string>("chat_with_polish_model", {
        messages: promptMessages(options.messages, options.context),
        modelId: options.modelId,
        streamId: options.assistantId,
        system: buildChatSystemPrompt(options.context, options.prompt),
        thinking: options.handle.thinking,
      }),
      signal
    );
    showAnswer(answer);
  } finally {
    stopListening();
    if (signal.aborted) {
      await invoke("stop_polish_chat", { streamId: options.assistantId });
    }
  }
};

interface ChatTurnOptions {
  context: ChatTextContext | null;
  generation: number;
  modelStatus: PolishStatus;
  prompt: ChatPrompt | null;
  /// `null` runs the active prompt on the reference instead of asking.
  question: string | null;
}

/// Question and pending answer land before any await, so the panel never waits on IPC.
const sendChatTurn = async (options: ChatTurnOptions) => {
  const question = options.question?.trim() ?? null;
  const store = useChatSessionStore.getState();
  const session = chatSessionFor(store, options.generation);
  if (question === "" || session.request !== null) {
    return;
  }
  const { model, state } = options.modelStatus;
  const block = chatModelBlock(state, model?.name);
  if (block !== null) {
    changeChatSession(options.generation, () => ({ error: block }));
    return;
  }
  const assistantId = makeMessageId();
  const controller = new AbortController();
  const handle = {
    controller,
    generation: options.generation,
    thinking:
      question !== null && model?.supports_thinking === true && store.thinking,
  };
  const started = startedTurn(session, {
    assistantId,
    question,
    request: handle,
  });
  changeChatSession(options.generation, () => started);
  try {
    await requestBundledResponse({
      assistantId,
      context: options.context,
      handle,
      messages: started.messages,
      modelId: model?.id,
      prompt: options.prompt,
    });
  } catch (caught) {
    changeChatSessionFromRequest(handle, (current) =>
      controller.signal.aborted
        ? { messages: dropEmptyAssistantTurn(current.messages, assistantId) }
        : failedTurn(current, {
            assistantId,
            message: chatFailureMessage(caught),
            question,
          })
    );
  } finally {
    changeChatSessionFromRequest(handle, () => ({ request: null }));
  }
};

/// Whatever covers the chat keeps its session alive; the last surface to leave ends it.
export const useChatSessionHold = (generation: number | null) => {
  useEffect(
    () => (generation === null ? undefined : holdChatSession(generation)),
    [generation]
  );
};

export const useChatEdge = (
  generation: number | null,
  modelState: PolishStatus["state"]
) =>
  useChatSessionStore((store) =>
    generation === null ? null : chatEdgeFor({ generation, modelState, store })
  );

const useSessionDictation = (generation: number) => {
  const state = useChatSessionStore((store) => store.dictation);
  const preview = useChatSessionStore((store) => store.dictationPreview);
  return useChatDictation({
    onDictated: (dictated) =>
      changeChatSession(generation, (current) => ({
        input: withDictatedText(current.input, dictated.text),
        isQuestionPending: dictated.handover === "ask",
      })),
    onError: (error) => changeChatSession(generation, () => ({ error })),
    onHeard: hearChatDictation,
    onStateChange: changeChatDictation,
    preview,
    state,
  });
};

const usePendingQuestion = (isDue: boolean, ask: () => void) => {
  const askPendingQuestion = useEffectEvent(ask);
  useEffect(() => {
    if (isDue) {
      askPendingQuestion();
    }
  }, [isDue]);
};

export const useChatSession = ({
  context,
  contextState,
  generation,
  isPromptReady,
  modelStatus,
  prompt,
}: ChatSessionOptions): ChatSession => {
  const session = useChatSessionStore((store) =>
    chatSessionFor(store, generation)
  );
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { model, state: modelState } = modelStatus;
  const thinking = useChatSessionStore((store) => store.thinking);
  const change = (next: ChatSessionChange) =>
    changeChatSession(generation, next);
  const sendTurn = (question: string | null) =>
    sendChatTurn({ context, generation, modelStatus, prompt, question });
  const dictation = useSessionDictation(generation);
  usePromptAutoRun({
    canRun: !session.isQuestionPending && session.messages.length === 0,
    context,
    disarm: () => change(() => ({ isPromptRunArmed: false })),
    isArmed: session.isPromptRunArmed,
    isSettled:
      contextState !== "loading" && isPromptReady && modelState === "ready",
    prompt,
    run: () => sendTurn(null),
  });
  usePendingQuestion(
    pendingQuestionIsDue({ contextState, modelState, session }),
    () => sendTurn(session.input)
  );
  return {
    dictation,
    error: session.error,
    input: session.input,
    inputRef,
    isResponding: session.request !== null,
    isThinking: session.request?.thinking === true,
    messages: session.messages,
    restart: () => restartChatSession(generation),
    send: () => {
      sendTurn(session.input);
    },
    /// An edited handover is a draft again: it goes out when the user sends it.
    setInput: (input) => change(() => ({ input, isQuestionPending: false })),
    showError: (error) => change(() => ({ error })),
    stop: () => session.request?.controller.abort(),
    thinkingMode: model?.supports_thinking
      ? { selected: thinking, setSelected: chooseThinking }
      : null,
  };
};

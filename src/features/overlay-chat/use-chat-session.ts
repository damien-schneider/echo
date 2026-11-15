import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import {
  buildChatSystemPrompt,
  CHAT_ANSWER_EVENT,
  ChatAnswerEventSchema,
  type ChatMessage,
  type ChatPrompt,
  dropEmptyAssistantTurn,
  makeMessageId,
  promptMessages,
  updateAssistantMessage,
  withDictatedText,
  withPendingTurn,
  withPromptRun,
} from "@/features/overlay-chat/chat";
import { usePromptAutoRun } from "@/features/overlay-chat/prompt-picker/use-prompt-auto-run";
import {
  type ChatDictation,
  useChatDictation,
} from "@/features/overlay-chat/use-chat-dictation";
import type {
  ChatContextEvent,
  ChatTextContext,
} from "@/features/overlay-controls/runtime/overlay-windows";
import { polishModelName } from "@/features/polish/polish-model-state";

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
  isBundledModelReady: boolean;
  isOpen: boolean;
  isPromptReady: boolean;
  prompt: ChatPrompt | null;
}

export interface ChatSession {
  dictation: ChatDictation;
  error: string;
  input: string;
  inputRef: RefObject<HTMLInputElement | null>;
  isResponding: boolean;
  messages: ChatMessage[];
  restart: () => void;
  send: () => void;
  setInput: Dispatch<SetStateAction<string>>;
  showError: (message: string) => void;
  stop: () => void;
}

interface AssistantStreamOptions {
  assistantId: string;
  context: ChatTextContext | null;
  controller: AbortController;
  messages: ChatMessage[];
  prompt: ChatPrompt | null;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
}

const requestBundledResponse = async (options: AssistantStreamOptions) => {
  const publishAnswer = (payload: unknown) => {
    const event = ChatAnswerEventSchema.safeParse(payload);
    if (event.success && event.data.stream_id === options.assistantId) {
      options.setMessages((current) =>
        updateAssistantMessage(current, options.assistantId, event.data.answer)
      );
    }
  };
  const stopListening = await listen<unknown>(CHAT_ANSWER_EVENT, (event) =>
    publishAnswer(event.payload)
  );
  try {
    const answer = await abortable(
      invoke<string>("chat_with_polish_model", {
        messages: promptMessages(options.messages),
        streamId: options.assistantId,
        system: buildChatSystemPrompt(options.context, options.prompt),
      }),
      options.controller.signal
    );
    options.setMessages((current) =>
      updateAssistantMessage(current, options.assistantId, answer)
    );
  } finally {
    stopListening();
    if (options.controller.signal.aborted) {
      await invoke("stop_polish_chat", { streamId: options.assistantId });
    }
  }
};

interface SendMessageOptions {
  abortRef: RefObject<AbortController | null>;
  context: ChatTextContext | null;
  input: string;
  isBundledModelReady: boolean;
  isPromptRun: boolean;
  isResponding: boolean;
  messages: ChatMessage[];
  prompt: ChatPrompt | null;
  setError: Dispatch<SetStateAction<string>>;
  setInput: Dispatch<SetStateAction<string>>;
  setIsResponding: Dispatch<SetStateAction<boolean>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
}

/// Prompt and pending answer land before any await, so the panel never waits on IPC.
const sendChatMessage = async (options: SendMessageOptions) => {
  const prompt = options.input.trim();
  if (!prompt || options.isResponding) {
    return;
  }
  if (!options.isBundledModelReady) {
    options.setError(`Download ${polishModelName} before chatting.`);
    return;
  }
  const assistantId = makeMessageId();
  const turn = options.isPromptRun
    ? withPromptRun(options.messages, prompt, assistantId)
    : withPendingTurn(options.messages, prompt, assistantId);
  const controller = new AbortController();
  options.abortRef.current = controller;
  if (!options.isPromptRun) {
    options.setInput("");
  }
  options.setError("");
  options.setIsResponding(true);
  options.setMessages(turn);
  try {
    await requestBundledResponse({
      assistantId,
      context: options.context,
      controller,
      messages: turn,
      prompt: options.prompt,
      setMessages: options.setMessages,
    });
  } catch (caught) {
    options.setMessages((current) =>
      dropEmptyAssistantTurn(current, assistantId)
    );
    if (!controller.signal.aborted) {
      options.setError(
        caught instanceof Error ? caught.message : "Chat request failed."
      );
    }
  } finally {
    if (options.abortRef.current === controller) {
      options.abortRef.current = null;
    }
    options.setIsResponding(false);
  }
};

const useChatLifecycle = (
  abortRef: RefObject<AbortController | null>,
  isOpen: boolean
) => {
  const abortCurrentRequest = useEffectEvent(() => {
    abortRef.current?.abort();
  });
  useEffect(() => {
    if (!isOpen) {
      abortCurrentRequest();
      return;
    }
    return abortCurrentRequest;
  }, [isOpen]);
};

export const useChatSession = ({
  context,
  contextState,
  isBundledModelReady,
  isOpen,
  isPromptReady,
  prompt,
}: ChatSessionOptions): ChatSession => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isResponding, setIsResponding] = useState(false);
  const [isQuestionPending, setIsQuestionPending] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dictation = useChatDictation({
    onDictated: (dictated) => {
      setInput((current) => withDictatedText(current, dictated.text));
      setIsQuestionPending(dictated.handover === "ask");
    },
    onError: setError,
  });
  const submit = (question: string, isPromptRun: boolean) =>
    sendChatMessage({
      abortRef,
      context,
      input: question,
      isBundledModelReady,
      isPromptRun,
      isResponding,
      messages,
      prompt,
      setError,
      setInput,
      setIsResponding,
      setMessages,
    });
  useChatLifecycle(abortRef, isOpen);
  const autoRun = usePromptAutoRun({
    canRun: !isQuestionPending && messages.length === 0,
    context,
    isSettled:
      contextState !== "loading" && isPromptReady && isBundledModelReady,
    prompt,
    run: (text) => submit(text, true),
  });
  const askPendingQuestion = useEffectEvent(() => submit(input, false));
  /// A transcript handed over whole waits for the reference it may be about before going out.
  useEffect(() => {
    if (!isQuestionPending || contextState === "loading") {
      return;
    }
    setIsQuestionPending(false);
    askPendingQuestion();
  }, [contextState, isQuestionPending]);
  return {
    dictation,
    error,
    input,
    inputRef,
    isResponding,
    messages,
    restart: () => {
      abortRef.current?.abort();
      setMessages([]);
      setError("");
      setIsResponding(false);
      autoRun.rearm();
    },
    send: () => {
      submit(input, false);
    },
    setInput,
    showError: setError,
    stop: () => abortRef.current?.abort(),
  };
};

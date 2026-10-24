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
  dropEmptyAssistantTurn,
  makeMessageId,
  promptMessages,
  updateAssistantMessage,
  withDictatedText,
  withPendingTurn,
} from "@/features/overlay-chat/chat";
import {
  type ChatDictation,
  useChatDictation,
} from "@/features/overlay-chat/use-chat-dictation";
import type {
  ChatContextEvent,
  ChatTextContext,
} from "@/features/overlay-controls/runtime/overlay-windows";

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
}

export interface ChatSession {
  dictation: ChatDictation;
  error: string;
  input: string;
  inputRef: RefObject<HTMLInputElement | null>;
  isResponding: boolean;
  messages: ChatMessage[];
  send: () => void;
  setInput: Dispatch<SetStateAction<string>>;
  stop: () => void;
}

interface AssistantStreamOptions {
  assistantId: string;
  context: ChatTextContext | null;
  controller: AbortController;
  messages: ChatMessage[];
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
        system: buildChatSystemPrompt(options.context),
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
  isResponding: boolean;
  messages: ChatMessage[];
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
    options.setError("Download Echo 4B before chatting.");
    return;
  }
  const assistantId = makeMessageId();
  const turn = withPendingTurn(options.messages, prompt, assistantId);
  const controller = new AbortController();
  options.abortRef.current = controller;
  options.setInput("");
  options.setError("");
  options.setIsResponding(true);
  options.setMessages(turn);
  try {
    await requestBundledResponse({
      assistantId,
      context: options.context,
      controller,
      messages: turn,
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
  const submit = (prompt: string) =>
    sendChatMessage({
      abortRef,
      context,
      input: prompt,
      isBundledModelReady,
      isResponding,
      messages,
      setError,
      setInput,
      setIsResponding,
      setMessages,
    });
  useChatLifecycle(abortRef, isOpen);
  const askPendingQuestion = useEffectEvent(() => submit(input));
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
    send: () => {
      submit(input);
    },
    setInput,
    stop: () => abortRef.current?.abort(),
  };
};

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { streamText } from "ai";
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
  buildChatModelOptions,
  buildChatSystemPrompt,
  CHAT_ANSWER_EVENT,
  CHAT_MODEL_KINDS,
  ChatAnswerEventSchema,
  type ChatLanguageModel,
  type ChatMessage,
  type ChatModelMode,
  type ChatModelOption,
  type ChatModelTransport,
  chatModelModeForOption,
  chatModelOptionsForMode,
  dropEmptyAssistantTurn,
  makeMessageId,
  promptMessages,
  resolveChatModel,
  selectedChatModelOption,
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
import type { Settings } from "@/lib/types";
import { useSettingsStore } from "@/stores/settings-store";

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

interface ChatSelection {
  mode: ChatModelMode;
  modelId: string;
}

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
  mode: ChatModelMode;
  modelOptions: ChatModelOption[];
  selected: ChatModelOption | null;
  selectMode: (mode: ChatModelMode) => void;
  selectModel: (modelId: string) => void;
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

/// One repaint per displayed frame, however fast the model emits tokens.
const streamProviderResponse = async (
  options: AssistantStreamOptions & { model: ChatLanguageModel }
) => {
  const stream = streamText({
    abortSignal: options.controller.signal,
    messages: promptMessages(options.messages),
    model: options.model,
    system: buildChatSystemPrompt(options.context),
  });
  let answer = "";
  let frame = 0;
  const paint = () => {
    frame = 0;
    options.setMessages((current) =>
      updateAssistantMessage(current, options.assistantId, answer)
    );
  };
  try {
    for await (const delta of stream.textStream) {
      answer += delta;
      if (frame === 0) {
        frame = requestAnimationFrame(paint);
      }
    }
  } finally {
    cancelAnimationFrame(frame);
    paint();
  }
};

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

const requestAssistantResponse = (
  options: AssistantStreamOptions & { transport: ChatModelTransport }
) =>
  options.transport.kind === CHAT_MODEL_KINDS.provider
    ? streamProviderResponse({ ...options, model: options.transport.model })
    : requestBundledResponse(options);

interface SendMessageOptions {
  abortRef: RefObject<AbortController | null>;
  context: ChatTextContext | null;
  input: string;
  isBundledModelReady: boolean;
  isResponding: boolean;
  messages: ChatMessage[];
  selected: ChatModelOption | null;
  setError: Dispatch<SetStateAction<string>>;
  setInput: Dispatch<SetStateAction<string>>;
  setIsResponding: Dispatch<SetStateAction<boolean>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  settings: Settings | null;
}

/// Prompt and pending answer land before any await, so the panel never waits on IPC.
const sendChatMessage = async (options: SendMessageOptions) => {
  const prompt = options.input.trim();
  if (!prompt || options.isResponding) {
    return;
  }
  const resolution = resolveChatModel(
    options.settings,
    options.selected,
    options.isBundledModelReady
  );
  if (resolution.state === "error") {
    options.setError(resolution.message);
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
    await requestAssistantResponse({
      assistantId,
      context: options.context,
      controller,
      messages: turn,
      setMessages: options.setMessages,
      transport: resolution.transport,
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
  const initializeSettings = useSettingsStore((store) => store.initialize);
  const abortCurrentRequest = useEffectEvent(() => {
    abortRef.current?.abort();
  });
  useEffect(() => {
    initializeSettings();
  }, [initializeSettings]);
  useEffect(() => {
    if (!isOpen) {
      abortCurrentRequest();
      return;
    }
    return abortCurrentRequest;
  }, [isOpen]);
};

const chatModelState = (
  settings: Settings | null,
  selection: ChatSelection | null
) => {
  const options = buildChatModelOptions(settings);
  const mode = selection?.mode ?? chatModelModeForOption(options[0]);
  const modelOptions = chatModelOptionsForMode(options, mode);
  const selected = selectedChatModelOption(
    modelOptions,
    selection?.modelId ?? ""
  );
  return { mode, modelOptions, options, selected };
};

export const useChatSession = ({
  context,
  contextState,
  isBundledModelReady,
  isOpen,
}: ChatSessionOptions): ChatSession => {
  const settings = useSettingsStore((store) => store.settings);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selection, setSelection] = useState<ChatSelection | null>(null);
  const [isResponding, setIsResponding] = useState(false);
  const [isQuestionPending, setIsQuestionPending] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { mode, modelOptions, options, selected } = chatModelState(
    settings,
    selection
  );
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
      selected,
      setError,
      setInput,
      setIsResponding,
      setMessages,
      settings,
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
    mode,
    modelOptions,
    selected,
    selectMode: (nextMode: ChatModelMode) =>
      setSelection({
        mode: nextMode,
        modelId: chatModelOptionsForMode(options, nextMode)[0]?.id ?? "",
      }),
    selectModel: (modelId: string) => setSelection({ mode, modelId }),
    send: () => {
      submit(input);
    },
    setInput,
    stop: () => abortRef.current?.abort(),
  };
};

import { invoke } from "@tauri-apps/api/core";
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
  CHAT_MODEL_KINDS,
  CHAT_ROLES,
  type ChatMessage,
  type ChatModelMode,
  type ChatModelOption,
  type ChatModelTransport,
  chatModelModeForOption,
  chatModelOptionsForMode,
  makeMessageId,
  modelMessage,
  resolveChatModel,
  selectedChatModelOption,
  updateAssistantMessage,
} from "@/features/overlay-chat/chat";
import type { ChatTextContext } from "@/features/overlay-controls/runtime/overlay-windows";
import type { Settings } from "@/lib/types";
import { useSettingsStore } from "@/stores/settings-store";

interface ChatSelection {
  mode: ChatModelMode;
  modelId: string;
}

export interface ChatSession {
  error: string;
  input: string;
  inputRef: RefObject<HTMLInputElement | null>;
  isResponding: boolean;
  messages: ChatMessage[];
  mode: ChatModelMode;
  modelOptions: ChatModelOption[];
  reportError: (caught: unknown) => void;
  selected: ChatModelOption | null;
  selectMode: (mode: ChatModelMode) => void;
  selectModel: (modelId: string) => void;
  send: (context?: ChatTextContext | null) => Promise<void>;
  setInput: Dispatch<SetStateAction<string>>;
  viewportRef: RefObject<HTMLDivElement | null>;
}

interface RequestAssistantOptions {
  assistantId: string;
  context: ChatTextContext | null;
  controller: AbortController;
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  transport: ChatModelTransport;
}

const requestAssistantResponse = async ({
  assistantId,
  controller,
  context,
  messages,
  transport,
  setMessages,
}: RequestAssistantOptions) => {
  if (transport.kind === CHAT_MODEL_KINDS.provider) {
    const result = streamText({
      abortSignal: controller.signal,
      messages: messages.map(modelMessage),
      model: transport.model,
      system: buildChatSystemPrompt(context),
    });
    let response = "";
    for await (const delta of result.textStream) {
      response += delta;
      setMessages((current) =>
        updateAssistantMessage(current, assistantId, response)
      );
    }
    return;
  }

  const operation = invoke<string>("chat_with_polish_model", {
    messages: messages.map(modelMessage),
    system: buildChatSystemPrompt(context),
  });
  const response = await new Promise<string>((resolve, reject) => {
    const handleAbort = () =>
      reject(controller.signal.reason ?? new Error("Chat request cancelled"));
    if (controller.signal.aborted) {
      handleAbort();
      return;
    }
    controller.signal.addEventListener("abort", handleAbort, { once: true });
    operation.then(resolve, reject).finally(() => {
      controller.signal.removeEventListener("abort", handleAbort);
    });
  });
  setMessages((current) =>
    updateAssistantMessage(current, assistantId, response)
  );
};

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
  const nextMessages = [
    ...options.messages,
    { content: prompt, id: makeMessageId(), role: CHAT_ROLES.user },
  ];
  const assistantId = makeMessageId();
  const controller = new AbortController();
  options.abortRef.current = controller;
  options.setInput("");
  options.setError("");
  options.setIsResponding(true);
  options.setMessages([
    ...nextMessages,
    { content: "", id: assistantId, role: CHAT_ROLES.assistant },
  ]);
  try {
    await requestAssistantResponse({
      assistantId,
      context: options.context,
      controller,
      messages: nextMessages,
      transport: resolution.transport,
      setMessages: options.setMessages,
    });
  } catch (caught) {
    if (!controller.signal.aborted) {
      options.setError(
        caught instanceof Error ? caught.message : "Chat request failed."
      );
      options.setMessages((current) =>
        current.filter(
          (message) => message.id !== assistantId || message.content.length > 0
        )
      );
    }
  } finally {
    if (options.abortRef.current === controller) {
      options.abortRef.current = null;
    }
    options.setIsResponding(false);
  }
};

const useChatLifecycle = ({
  abortRef,
  isOpen,
  viewportRef,
}: {
  abortRef: RefObject<AbortController | null>;
  isOpen: boolean;
  viewportRef: RefObject<HTMLDivElement | null>;
}) => {
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
  useEffect(() => {
    viewportRef.current?.scrollTo({
      behavior: "smooth",
      top: viewportRef.current.scrollHeight,
    });
  });
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

export const useChatSession = (
  isOpen: boolean,
  context: ChatTextContext | null,
  isBundledModelReady: boolean
): ChatSession => {
  const settings = useSettingsStore((store) => store.settings);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selection, setSelection] = useState<ChatSelection | null>(null);
  const [isResponding, setIsResponding] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const { mode, modelOptions, options, selected } = chatModelState(
    settings,
    selection
  );
  useChatLifecycle({ abortRef, isOpen, viewportRef });
  const selectMode = (nextMode: ChatModelMode) =>
    setSelection({
      mode: nextMode,
      modelId: chatModelOptionsForMode(options, nextMode)[0]?.id ?? "",
    });
  const selectModel = (modelId: string) => setSelection({ mode, modelId });
  const send = (latestContext: ChatTextContext | null = context) =>
    sendChatMessage({
      abortRef,
      context: latestContext,
      input,
      isResponding,
      isBundledModelReady,
      messages,
      selected,
      setError,
      setInput,
      setIsResponding,
      setMessages,
      settings,
    });
  return {
    error,
    input,
    inputRef,
    isResponding,
    messages,
    mode,
    modelOptions,
    reportError: (caught: unknown) => {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not refresh selected text."
      );
    },
    selected,
    selectMode,
    selectModel,
    send,
    setInput,
    viewportRef,
  };
};

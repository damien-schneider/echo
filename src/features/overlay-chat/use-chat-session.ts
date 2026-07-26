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
  CHAT_ROLES,
  type ChatLanguageModel,
  type ChatMessage,
  type ChatModelMode,
  type ChatModelOption,
  chatModelModeForOption,
  chatModelOptionsForMode,
  makeMessageId,
  modelMessage,
  resolveChatModel,
  selectedChatModelOption,
  updateAssistantMessage,
} from "@/features/overlay-chat/chat";
import type { Settings } from "@/lib/types";
import { useSettingsStore } from "@/stores/settings-store";

const SYSTEM_PROMPT =
  "You are Echo's compact desktop assistant. Answer directly, keep the thread context, and stay concise unless the user asks for detail.";

interface ChatSelection {
  mode: ChatModelMode;
  modelId: string;
}

interface StreamAssistantOptions {
  assistantId: string;
  controller: AbortController;
  messages: ChatMessage[];
  model: ChatLanguageModel;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
}

const streamAssistantResponse = async ({
  assistantId,
  controller,
  messages,
  model,
  setMessages,
}: StreamAssistantOptions) => {
  const result = streamText({
    abortSignal: controller.signal,
    messages: messages.map(modelMessage),
    model,
    system: SYSTEM_PROMPT,
  });
  let response = "";
  for await (const delta of result.textStream) {
    response += delta;
    setMessages((current) =>
      updateAssistantMessage(current, assistantId, response)
    );
  }
};

interface SendMessageOptions {
  abortRef: RefObject<AbortController | null>;
  input: string;
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
  const resolution = resolveChatModel(options.settings, options.selected);
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
    await streamAssistantResponse({
      assistantId,
      controller,
      messages: nextMessages,
      model: resolution.model,
      setMessages: options.setMessages,
    });
  } catch (caught) {
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

export const useChatSession = (isOpen: boolean) => {
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
  const send = () =>
    sendChatMessage({
      abortRef,
      input,
      isResponding,
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
    options,
    selected,
    selectMode,
    selectModel,
    send,
    setInput,
    viewportRef,
  };
};

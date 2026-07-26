import { createLlmModel } from "@/lib/llm/providers";
import type { Settings } from "@/lib/types";

export const CHAT_ROLES = {
  assistant: "assistant",
  user: "user",
} as const;

export type ChatRole = (typeof CHAT_ROLES)[keyof typeof CHAT_ROLES];

export interface ChatMessage {
  content: string;
  id: string;
  role: ChatRole;
}

export interface ChatProviderConfig {
  base_url?: string;
  id: string;
  label: string;
}

export interface ChatModelSettings {
  post_process_models: Record<string, string>;
  post_process_provider_id: string;
  post_process_providers: ChatProviderConfig[];
}

export interface ChatModelOption {
  id: string;
  isLocal: boolean;
  label: string;
  modelId: string;
  providerId: string;
  providerLabel: string;
}

export const CHAT_MODEL_MODES = {
  cloud: "cloud",
  local: "local",
} as const;

export type ChatModelMode =
  (typeof CHAT_MODEL_MODES)[keyof typeof CHAT_MODEL_MODES];

export type ChatLanguageModel = ReturnType<typeof createLlmModel>;

export type ChatModelResolution =
  | { model: ChatLanguageModel; state: "ready" }
  | { message: string; state: "error" };

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1"];

export const chatModelOptionId = (
  providerId: string,
  modelId: string
): string => `${providerId}:${modelId}`;

const isLocalProvider = (provider: ChatProviderConfig): boolean => {
  if (provider.id === "ollama") {
    return true;
  }

  const baseUrl = provider.base_url ?? "";
  if (!baseUrl.trim()) {
    return false;
  }

  try {
    const url = new URL(baseUrl);
    return LOCAL_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
};

export const buildChatModelOptions = (
  settings: ChatModelSettings | null
): ChatModelOption[] => {
  if (!settings) {
    return [];
  }

  const options = settings.post_process_providers.flatMap((provider) => {
    const modelId = settings.post_process_models[provider.id]?.trim() ?? "";
    if (!modelId) {
      return [];
    }

    return [
      {
        id: chatModelOptionId(provider.id, modelId),
        isLocal: isLocalProvider(provider),
        label: `${provider.label} · ${modelId}`,
        modelId,
        providerId: provider.id,
        providerLabel: provider.label,
      },
    ];
  });

  const activeOption = options.find(
    (option) => option.providerId === settings.post_process_provider_id
  );
  if (!activeOption) {
    return options;
  }

  return [
    activeOption,
    ...options.filter((option) => option.id !== activeOption.id),
  ];
};

export const selectedChatModelOption = (
  options: ChatModelOption[],
  selectedId: string
): ChatModelOption | null =>
  options.find((option) => option.id === selectedId) ?? options[0] ?? null;

export const chatModelOptionsForMode = (
  options: ChatModelOption[],
  mode: ChatModelMode
): ChatModelOption[] =>
  options.filter(
    (option) => option.isLocal === (mode === CHAT_MODEL_MODES.local)
  );

export const chatModelModeForOption = (
  option: ChatModelOption | undefined
): ChatModelMode =>
  !option || option.isLocal ? CHAT_MODEL_MODES.local : CHAT_MODEL_MODES.cloud;

export const makeMessageId = (): string => crypto.randomUUID();

export const modelMessage = (message: ChatMessage) => ({
  content: message.content,
  role: message.role,
});

export const updateAssistantMessage = (
  messages: ChatMessage[],
  id: string,
  content: string
): ChatMessage[] =>
  messages.map((message) =>
    message.id === id ? { ...message, content } : message
  );

export const resolveChatModel = (
  settings: Settings | null,
  selected: ChatModelOption | null
): ChatModelResolution => {
  if (!(settings && selected)) {
    return {
      message: "Configure a chat model in Settings first.",
      state: "error",
    };
  }

  const provider = settings.post_process_providers.find(
    (candidate) => candidate.id === selected.providerId
  );
  if (!provider) {
    return {
      message: "Selected provider is no longer available.",
      state: "error",
    };
  }

  const apiKey = settings.post_process_api_keys[provider.id] ?? "";
  return {
    model: createLlmModel(provider, apiKey, selected.modelId),
    state: "ready",
  };
};

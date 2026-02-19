import { useCallback } from "react";
import type { PostProcessProvider } from "@/lib/types";
import { useSetting, useSettingsStore } from "@/stores/settings-store";
import { getDefaultBaseUrl } from "./default-providers";
import type { ModelOption } from "./types";

interface DropdownOption {
  value: string;
  label: string;
}

interface PostProcessProviderState {
  enabled: boolean;
  providerOptions: DropdownOption[];
  selectedProviderId: string;
  selectedProvider: PostProcessProvider | undefined;
  isCustomProvider: boolean;
  isOllamaProvider: boolean;
  isLocalProvider: boolean;
  baseUrl: string;
  defaultBaseUrl: string | undefined;
  isBaseUrlModified: boolean;
  handleBaseUrlChange: (value: string) => void;
  handleBaseUrlReset: () => void;
  isBaseUrlUpdating: boolean;
  apiKey: string;
  handleApiKeyChange: (value: string) => void;
  isApiKeyUpdating: boolean;
  model: string;
  handleModelChange: (value: string) => void;
  modelOptions: ModelOption[];
  isModelUpdating: boolean;
  isFetchingModels: boolean;
  handleProviderSelect: (providerId: string) => void;
  handleModelSelect: (value: string) => void;
  handleModelCreate: (value: string) => void;
  handleRefreshModels: () => void;
}

export const usePostProcessProviderState = (): PostProcessProviderState => {
  // Settings data
  const providers = useSetting("post_process_providers") ?? [];
  const selectedProviderIdSetting = useSetting("post_process_provider_id");
  const apiKeys = useSetting("post_process_api_keys");
  const models = useSetting("post_process_models");

  // Store slices
  const postProcessModelOptions = useSettingsStore(
    (s) => s.postProcessModelOptions
  );
  const isUpdatingMap = useSettingsStore((s) => s.isUpdating);

  // Actions (stable references)
  const setPostProcessProvider = useSettingsStore(
    (s) => s.setPostProcessProvider
  );
  const updatePostProcessSetting = useSettingsStore(
    (s) => s.updatePostProcessSetting
  );
  const updatePostProcessApiKeyAction = useSettingsStore(
    (s) => s.updatePostProcessApiKey
  );
  const fetchPostProcessModels = useSettingsStore(
    (s) => s.fetchPostProcessModels
  );

  // Settings are guaranteed to have providers after migration
  const selectedProviderId =
    selectedProviderIdSetting || providers[0]?.id || "openai";

  const selectedProvider =
    providers.find((provider) => provider.id === selectedProviderId) ||
    providers[0];

  // Use settings directly as single source of truth
  const baseUrl = selectedProvider?.base_url ?? "";
  const defaultBaseUrl = getDefaultBaseUrl(selectedProviderId);
  const isBaseUrlModified =
    defaultBaseUrl !== undefined &&
    (baseUrl !== defaultBaseUrl || baseUrl === "");
  const apiKey = apiKeys?.[selectedProviderId] ?? "";
  const model = models?.[selectedProviderId] ?? "";

  const providerOptions: DropdownOption[] = providers.map((provider) => ({
    value: provider.id,
    label: provider.label,
  }));

  const handleProviderSelect = (providerId: string) => {
    if (providerId !== selectedProviderId) {
      setPostProcessProvider(providerId);
    }
  };

  const handleBaseUrlChange = (value: string) => {
    if (!selectedProvider?.allow_base_url_edit) {
      return;
    }
    const trimmed = value.trim();
    if (trimmed && trimmed !== baseUrl) {
      updatePostProcessSetting("base_url", selectedProvider.id, trimmed);
    }
  };

  const handleBaseUrlReset = () => {
    if (!(selectedProvider?.allow_base_url_edit && defaultBaseUrl)) {
      return;
    }
    if (baseUrl !== defaultBaseUrl) {
      updatePostProcessSetting("base_url", selectedProvider.id, defaultBaseUrl);
    }
  };

  const handleApiKeyChange = (value: string) => {
    const trimmed = value.trim();
    if (trimmed !== apiKey) {
      updatePostProcessApiKeyAction(selectedProviderId, trimmed);
    }
  };

  const handleModelChange = (value: string) => {
    const trimmed = value.trim();
    if (trimmed !== model) {
      updatePostProcessSetting("model", selectedProviderId, trimmed);
    }
  };

  const handleModelSelect = (value: string) => {
    updatePostProcessSetting("model", selectedProviderId, value.trim());
  };

  const handleModelCreate = (value: string) => {
    updatePostProcessSetting("model", selectedProviderId, value);
  };

  const handleRefreshModels = useCallback(() => {
    fetchPostProcessModels(selectedProviderId);
  }, [fetchPostProcessModels, selectedProviderId]);

  const availableModelsRaw = postProcessModelOptions[selectedProviderId] || [];

  const modelOptions: ModelOption[] = (() => {
    const seen = new Set<string>();
    const options: ModelOption[] = [];

    const upsert = (value: string | null | undefined) => {
      const trimmed = value?.trim();
      if (!trimmed || seen.has(trimmed)) {
        return;
      }
      seen.add(trimmed);
      options.push({ value: trimmed, label: trimmed });
    };

    // Add available models from API
    for (const candidate of availableModelsRaw) {
      upsert(candidate);
    }

    // Ensure current model is in the list
    upsert(model);

    return options;
  })();

  const isBaseUrlUpdating = Boolean(
    isUpdatingMap[`post_process_base_url:${selectedProviderId}`]
  );
  const isApiKeyUpdating = Boolean(
    isUpdatingMap[`post_process_api_key:${selectedProviderId}`]
  );
  const isModelUpdating = Boolean(
    isUpdatingMap[`post_process_model:${selectedProviderId}`]
  );
  const isFetchingModels = Boolean(
    isUpdatingMap[`post_process_models_fetch:${selectedProviderId}`]
  );

  // Ollama and custom providers don't require API keys
  const isCustomProvider = selectedProvider?.id === "custom";
  const isOllamaProvider = selectedProvider?.id === "ollama";
  const isLocalProvider = isCustomProvider || isOllamaProvider;

  // Auto-fetch models when provider changes
  // Note: useSettings hook should handle this, but we trigger it here for provider changes
  // The fetchPostProcessModels will handle API key validation internally

  return {
    enabled: true,
    providerOptions,
    selectedProviderId,
    selectedProvider,
    isCustomProvider,
    isOllamaProvider,
    isLocalProvider,
    baseUrl,
    defaultBaseUrl,
    isBaseUrlModified,
    handleBaseUrlChange,
    handleBaseUrlReset,
    isBaseUrlUpdating,
    apiKey,
    handleApiKeyChange,
    isApiKeyUpdating,
    model,
    handleModelChange,
    modelOptions,
    isModelUpdating,
    isFetchingModels,
    handleProviderSelect,
    handleModelSelect,
    handleModelCreate,
    handleRefreshModels,
  };
};

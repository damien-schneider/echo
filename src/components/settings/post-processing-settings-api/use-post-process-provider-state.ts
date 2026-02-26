import { useCallback, useEffect } from "react";
import type { PostProcessProvider } from "@/lib/types";
import { useSetting, useSettingsStore } from "@/stores/settings-store";
import { getDefaultBaseUrl } from "./default-providers";
import type { ModelOption } from "./types";

interface DropdownOption {
  label: string;
  value: string;
}

/** `true` = supports tools, `false` = does not, `null` = unknown / checking */
export type ToolSupportStatus = boolean | null;

interface PostProcessProviderState {
  apiKey: string;
  baseUrl: string;
  defaultBaseUrl: string | undefined;
  enabled: boolean;
  handleApiKeyChange: (value: string) => void;
  handleBaseUrlChange: (value: string) => void;
  handleBaseUrlReset: () => void;
  handleModelChange: (value: string) => void;
  handleModelCreate: (value: string) => void;
  handleModelSelect: (value: string) => void;
  handleProviderSelect: (providerId: string) => void;
  handleRefreshModels: () => void;
  isApiKeyUpdating: boolean;
  isBaseUrlModified: boolean;
  isBaseUrlUpdating: boolean;
  isCustomProvider: boolean;
  isFetchingModels: boolean;
  isLocalProvider: boolean;
  isModelUpdating: boolean;
  isOllamaProvider: boolean;
  model: string;
  modelOptions: ModelOption[];
  providerOptions: DropdownOption[];
  selectedProvider: PostProcessProvider | undefined;
  selectedProviderId: string;
  toolSupport: ToolSupportStatus;
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
  const modelToolSupport = useSettingsStore((s) => s.modelToolSupport);

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
  const checkModelToolSupportAction = useSettingsStore(
    (s) => s.checkModelToolSupport
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

  // Check tool support when provider or model changes
  useEffect(() => {
    if (selectedProviderId && model.trim()) {
      checkModelToolSupportAction(selectedProviderId, model);
    }
  }, [selectedProviderId, model, checkModelToolSupportAction]);

  // Read cached tool support status
  const cacheKey = `${selectedProviderId}:${model}`;
  const toolSupport: ToolSupportStatus =
    model.trim() && cacheKey in modelToolSupport
      ? (modelToolSupport[cacheKey] ?? null)
      : null;

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
    toolSupport,
  };
};

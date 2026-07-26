import { useCallback, useEffect } from "react";
import type { PostProcessProvider } from "@/lib/types";
import { useSetting, useSettingsStore } from "@/stores/settings-store";
import { getDefaultBaseUrl } from "./default-providers";
import type { ModelOption } from "./types";

interface DropdownOption {
  label: string;
  value: string;
}

// true=supports, false=no, null=unknown/checking.
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
  const providers = useSetting("post_process_providers") ?? [];
  const selectedProviderIdSetting = useSetting("post_process_provider_id");
  const apiKeys = useSetting("post_process_api_keys");
  const models = useSetting("post_process_models");

  const postProcessModelOptions = useSettingsStore(
    (s) => s.postProcessModelOptions
  );
  const isUpdatingMap = useSettingsStore((s) => s.isUpdating);
  const modelToolSupport = useSettingsStore((s) => s.modelToolSupport);

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

  const selectedProviderId =
    selectedProviderIdSetting || providers[0]?.id || "openai";

  const selectedProvider =
    providers.find((provider) => provider.id === selectedProviderId) ||
    providers[0];

  const baseUrl = selectedProvider?.base_url ?? "";
  const defaultBaseUrl = getDefaultBaseUrl(selectedProviderId);
  const isBaseUrlModified =
    defaultBaseUrl !== undefined &&
    (baseUrl !== defaultBaseUrl || baseUrl === "");
  const apiKey = apiKeys?.[selectedProviderId] ?? "";
  const model = models?.[selectedProviderId] ?? "";

  const providerOptions: DropdownOption[] = providers.map((provider) => ({
    label: provider.label,
    value: provider.id,
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
      options.push({ label: trimmed, value: trimmed });
    };

    for (const candidate of availableModelsRaw) {
      upsert(candidate);
    }

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

  // Ollama / custom: no API key required.
  const isCustomProvider = selectedProvider?.id === "custom";
  const isOllamaProvider = selectedProvider?.id === "ollama";
  const isLocalProvider = isCustomProvider || isOllamaProvider;

  useEffect(() => {
    if (selectedProviderId && model.trim()) {
      checkModelToolSupportAction(selectedProviderId, model);
    }
  }, [selectedProviderId, model, checkModelToolSupportAction]);

  const cacheKey = `${selectedProviderId}:${model}`;
  const toolSupport: ToolSupportStatus =
    model.trim() && cacheKey in modelToolSupport
      ? (modelToolSupport[cacheKey] ?? null)
      : null;

  return {
    apiKey,
    baseUrl,
    defaultBaseUrl,
    enabled: true,
    handleApiKeyChange,
    handleBaseUrlChange,
    handleBaseUrlReset,
    handleModelChange,
    handleModelCreate,
    handleModelSelect,
    handleProviderSelect,
    handleRefreshModels,
    isApiKeyUpdating,
    isBaseUrlModified,
    isBaseUrlUpdating,
    isCustomProvider,
    isFetchingModels,
    isLocalProvider,
    isModelUpdating,
    isOllamaProvider,
    model,
    modelOptions,
    providerOptions,
    selectedProvider,
    selectedProviderId,
    toolSupport,
  };
};

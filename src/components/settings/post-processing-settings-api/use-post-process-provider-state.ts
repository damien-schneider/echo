import { useEffect } from "react";
import { getDefaultBaseUrl } from "@/components/settings/post-processing-settings-api/default-providers";
import type { ModelOption } from "@/components/settings/post-processing-settings-api/types";
import type { PostProcessProvider } from "@/lib/types";
import { useSetting, useSettingsStore } from "@/stores/settings-store";

interface DropdownOption {
  label: string;
  value: string;
}

export type ToolSupportStatus = boolean | null;

interface PostProcessProviderState {
  apiKey: string;
  baseUrl: string;
  defaultBaseUrl: string | undefined;
  handleApiKeyChange: (value: string) => void;
  handleBaseUrlChange: (value: string) => void;
  handleModelCreate: (value: string) => void;
  handleModelSelect: (value: string) => void;
  handleProviderSelect: (providerId: string) => void;
  handleRefreshModels: () => void;
  isApiKeyUpdating: boolean;
  isBaseUrlUpdating: boolean;
  isFetchingModels: boolean;
  isLocalProvider: boolean;
  isModelUpdating: boolean;
  model: string;
  modelOptions: ModelOption[];
  providerOptions: DropdownOption[];
  selectedProvider: PostProcessProvider | undefined;
  selectedProviderId: string;
}

export const useModelToolSupport = (
  providerId: string,
  model: string
): ToolSupportStatus => {
  const modelToolSupport = useSettingsStore((s) => s.modelToolSupport);
  const checkModelToolSupport = useSettingsStore(
    (s) => s.checkModelToolSupport
  );
  useEffect(() => {
    if (model.trim()) {
      checkModelToolSupport(providerId, model);
    }
  }, [providerId, model, checkModelToolSupport]);
  return modelToolSupport[`${providerId}:${model}`] ?? null;
};

export const usePostProcessProviderState = (): PostProcessProviderState => {
  const providers = useSetting("post_process_providers") ?? [];
  const selectedProviderIdSetting = useSetting("post_process_provider_id");
  const apiKeys = useSetting("post_process_api_keys");
  const models = useSetting("post_process_models");

  const postProcessModelOptions = useSettingsStore(
    (s) => s.postProcessModelOptions
  );
  const isUpdatingMap = useSettingsStore((s) => s.isUpdating);

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

  const selectedProviderId =
    selectedProviderIdSetting || providers[0]?.id || "openai";

  const selectedProvider =
    providers.find((provider) => provider.id === selectedProviderId) ||
    providers[0];

  const baseUrl = selectedProvider?.base_url ?? "";
  const defaultBaseUrl = getDefaultBaseUrl(selectedProviderId);
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

  const handleApiKeyChange = (value: string) => {
    const trimmed = value.trim();
    if (trimmed !== apiKey) {
      updatePostProcessApiKeyAction(selectedProviderId, trimmed);
    }
  };

  const handleModelSelect = (value: string) => {
    updatePostProcessSetting("model", selectedProviderId, value.trim());
  };

  const handleModelCreate = (value: string) => {
    updatePostProcessSetting("model", selectedProviderId, value);
  };

  const handleRefreshModels = () => {
    fetchPostProcessModels(selectedProviderId);
  };

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

  const isLocalProvider =
    selectedProvider?.id === "custom" || selectedProvider?.id === "ollama";
  return {
    apiKey,
    baseUrl,
    defaultBaseUrl,
    handleApiKeyChange,
    handleBaseUrlChange,
    handleModelCreate,
    handleModelSelect,
    handleProviderSelect,
    handleRefreshModels,
    isApiKeyUpdating,
    isBaseUrlUpdating,
    isFetchingModels,
    isLocalProvider,
    isModelUpdating,
    model,
    modelOptions,
    providerOptions,
    selectedProvider,
    selectedProviderId,
  };
};

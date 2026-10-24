import { Button } from "@ctrl-ui/react/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@ctrl-ui/react/ui/tooltip";
import { ArrowsCounterClockwiseIcon } from "@phosphor-icons/react";
import { useEffect } from "react";
import { ApiKeyField } from "@/components/settings/post-processing-settings-api/api-key-field";
import { BaseUrlField } from "@/components/settings/post-processing-settings-api/base-url-field";
import { ModelSelect } from "@/components/settings/post-processing-settings-api/model-select";
import { ProviderSelect } from "@/components/settings/post-processing-settings-api/provider-select";
import { usePostProcessProviderState } from "@/components/settings/post-processing-settings-api/use-post-process-provider-state";
import { SettingRow } from "@/features/settings/setting-row";
import { useSettingsStore } from "@/stores/settings-store";

export const AiProviderSettings = () => {
  const state = usePostProcessProviderState();
  const fetchPostProcessModels = useSettingsStore(
    (s) => s.fetchPostProcessModels
  );
  useEffect(() => {
    fetchPostProcessModels(state.selectedProviderId);
  }, [fetchPostProcessModels, state.selectedProviderId]);
  return (
    <>
      <SettingRow
        description="Shared by Chat, post-processing, and meeting summaries."
        layout="horizontal"
        title="Provider"
      >
        <ProviderSelect
          onChange={state.handleProviderSelect}
          options={state.providerOptions}
          value={state.selectedProviderId}
        />
      </SettingRow>

      <SettingRow
        description="Editable for custom providers."
        layout="stacked"
        title="Base URL"
      >
        <BaseUrlField
          className="w-full"
          defaultBaseUrl={state.defaultBaseUrl}
          disabled={
            !state.selectedProvider?.allow_base_url_edit ||
            state.isBaseUrlUpdating
          }
          onBlur={state.handleBaseUrlChange}
          placeholder="https://api.openai.com/v1"
          value={state.baseUrl}
        />
      </SettingRow>

      <SettingRow
        description={
          state.isLocalProvider ? "Optional for local providers." : undefined
        }
        layout="horizontal"
        title="API key"
      >
        <ApiKeyField
          className="w-full"
          disabled={state.isApiKeyUpdating}
          onBlur={state.handleApiKeyChange}
          placeholder={state.isLocalProvider ? "(optional)" : "sk-..."}
          value={state.apiKey}
        />
      </SettingRow>

      <SettingRow
        description={
          state.isLocalProvider
            ? "Use the model name from your endpoint, such as llama3.2."
            : undefined
        }
        layout="stacked"
        title="Model"
      >
        <div className="flex min-w-0 items-center gap-2">
          <ModelSelect
            className="min-w-0 flex-1"
            disabled={state.isModelUpdating}
            isLoading={state.isFetchingModels}
            onCreate={state.handleModelCreate}
            onSelect={state.handleModelSelect}
            options={state.modelOptions}
            placeholder={
              state.modelOptions.length > 0
                ? "Search or select a model"
                : "Type a model name"
            }
            value={state.model}
          />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label="Refresh models"
                    disabled={state.isFetchingModels}
                    iconOnly
                    onClick={state.handleRefreshModels}
                    variant="ghost"
                  />
                }
              >
                <ArrowsCounterClockwiseIcon
                  className={
                    state.isFetchingModels ? "animate-spin" : undefined
                  }
                />
              </TooltipTrigger>
              <TooltipContent>Refresh models</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </SettingRow>
    </>
  );
};

import { Button } from "@ctrl-ui/react/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@ctrl-ui/react/ui/tooltip";
import { RefreshCcw } from "lucide-react";
import { useEffect, useEffectEvent } from "react";
import {
  ToolCallingSection,
  VoiceCommandsToggle,
} from "@/components/settings/post-processing/voice-commands";
import { ApiKeyField } from "@/components/settings/post-processing-settings-api/api-key-field";
import { BaseUrlField } from "@/components/settings/post-processing-settings-api/base-url-field";
import { ModelSelect } from "@/components/settings/post-processing-settings-api/model-select";
import { ProviderSelect } from "@/components/settings/post-processing-settings-api/provider-select";
import { usePostProcessProviderState } from "@/components/settings/post-processing-settings-api/use-post-process-provider-state";
import { SettingRow } from "@/features/settings/setting-row";
import { cn } from "@/lib/utils";
export const PostProcessingSettingsApi = () => {
  const state = usePostProcessProviderState();
  const refreshModels = useEffectEvent(state.handleRefreshModels);
  useEffect(() => {
    if (state.enabled && state.selectedProviderId) {
      refreshModels();
    }
  }, [state.enabled, state.selectedProviderId]);
  return (
    <>
      <SettingRow
        description="Select the AI provider used by Chat and post-processing."
        layout="horizontal"
        title="Provider"
      >
        <div className="flex min-w-0 items-center gap-2">
          <ProviderSelect
            onChange={state.handleProviderSelect}
            options={state.providerOptions}
            value={state.selectedProviderId}
          />
        </div>
      </SettingRow>

      <SettingRow
        description="API base URL for the selected provider. Only the custom provider can be edited."
        layout="stacked"
        title="Base URL"
      >
        <div className="flex min-w-0 items-center gap-2">
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
        </div>
      </SettingRow>

      <SettingRow
        description={
          state.isLocalProvider
            ? "API key is optional for local providers like Ollama."
            : "API key for the selected provider."
        }
        layout="horizontal"
        title="API Key"
      >
        <div className="flex min-w-0 items-center gap-2">
          <ApiKeyField
            className="w-full"
            disabled={state.isApiKeyUpdating}
            onBlur={state.handleApiKeyChange}
            placeholder={state.isLocalProvider ? "(optional)" : "sk-..."}
            value={state.apiKey}
          />
        </div>
      </SettingRow>

      <SettingRow
        description={
          state.isLocalProvider
            ? "Provide the model identifier expected by your endpoint (e.g., llama3.2 for Ollama)."
            : "Choose a model exposed by the selected provider."
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
                    className="flex h-10 w-10 items-center justify-center"
                    disabled={state.isFetchingModels}
                    iconOnly
                    onClick={state.handleRefreshModels}
                    size="md"
                    variant="ghost"
                  />
                }
              >
                <RefreshCcw
                  className={cn(
                    "h-4 w-4",
                    state.isFetchingModels && "animate-spin"
                  )}
                />
              </TooltipTrigger>
              <TooltipContent>
                <p>Fetch available models from the provider</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </SettingRow>

      <VoiceCommandsToggle />
      <ToolCallingSection toolSupport={state.toolSupport} />
    </>
  );
};

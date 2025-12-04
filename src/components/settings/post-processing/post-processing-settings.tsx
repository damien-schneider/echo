import { invoke } from "@tauri-apps/api/core";
import {
  CheckIcon,
  PencilIcon,
  PlusIcon,
  RefreshCcw,
  RotateCcw,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MarkdownEditor } from "@/components/editor/markdown-editor";
import { AiSdkToolsToggle } from "@/components/settings/post-processing/ai-sdk-tools-toggle";
import { ApiKeyField } from "@/components/settings/post-processing-settings-api/api-key-field";
import { BaseUrlField } from "@/components/settings/post-processing-settings-api/base-url-field";
import { ModelSelect } from "@/components/settings/post-processing-settings-api/model-select";
import { ProviderSelect } from "@/components/settings/post-processing-settings-api/provider-select";
import { usePostProcessProviderState } from "@/components/settings/post-processing-settings-api/use-post-process-provider-state";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { SettingContainer } from "@/components/ui/SettingContainer";
import { SettingsGroup } from "@/components/ui/SettingsGroup";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSettings } from "@/hooks/use-settings";
import type { LLMPrompt } from "@/lib/types";

const DisabledNotice = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-lg border border-border/20 bg-muted/5 p-4 text-center">
    <p className="text-muted-foreground text-sm">{children}</p>
  </div>
);

const PostProcessingSettingsApiComponent = () => {
  const state = usePostProcessProviderState();
  const [localBaseUrl, setLocalBaseUrl] = useState(state.baseUrl);

  // Sync local value when saved value changes (e.g., after reset or provider change)
  useEffect(() => {
    setLocalBaseUrl(state.baseUrl);
  }, [state.baseUrl]);

  // Fetch models on mount
  useEffect(() => {
    if (state.enabled && state.selectedProviderId) {
      state.handleRefreshModels();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Check if local value differs from default
  const isLocalBaseUrlModified =
    state.defaultBaseUrl !== undefined &&
    (localBaseUrl !== state.defaultBaseUrl || localBaseUrl === "");

  const handleBaseUrlReset = () => {
    if (state.defaultBaseUrl) {
      setLocalBaseUrl(state.defaultBaseUrl);
      state.handleBaseUrlChange(state.defaultBaseUrl);
    }
  };

  if (!state.enabled) {
    return (
      <DisabledNotice>
        Post processing is available only for beta features. Enable beta mode in
        the Experiments section to configure providers.
      </DisabledNotice>
    );
  }

  return (
    <>
      <SettingContainer
        description="Select an OpenAI-compatible provider."
        descriptionMode="tooltip"
        grouped={true}
        layout="horizontal"
        title="Provider"
      >
        <div className="flex items-center gap-2">
          <ProviderSelect
            onChange={state.handleProviderSelect}
            options={state.providerOptions}
            value={state.selectedProviderId}
          />
        </div>
      </SettingContainer>

      <SettingContainer
        description="API base URL for the selected provider. Only the custom provider can be edited."
        descriptionMode="tooltip"
        grouped={true}
        layout="stacked"
        title="Base URL"
      >
        <div className="flex items-center gap-2">
          <BaseUrlField
            className="min-w-[380px]"
            disabled={
              !state.selectedProvider?.allow_base_url_edit ||
              state.isBaseUrlUpdating
            }
            onBlur={state.handleBaseUrlChange}
            onChange={setLocalBaseUrl}
            placeholder="https://api.openai.com/v1"
            value={state.baseUrl}
          />
          {isLocalBaseUrlModified &&
            state.selectedProvider?.allow_base_url_edit && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label="Reset to default"
                      className="flex h-10 w-10 items-center justify-center"
                      disabled={state.isBaseUrlUpdating}
                      onClick={handleBaseUrlReset}
                      size="icon"
                      variant="ghost"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Reset to default: {state.defaultBaseUrl}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
        </div>
      </SettingContainer>

      <SettingContainer
        description={
          state.isLocalProvider
            ? "API key is optional for local providers like Ollama."
            : "API key for the selected provider."
        }
        descriptionMode="tooltip"
        grouped={true}
        layout="horizontal"
        title="API Key"
      >
        <div className="flex items-center gap-2">
          <ApiKeyField
            className="min-w-[320px]"
            disabled={state.isApiKeyUpdating}
            onBlur={state.handleApiKeyChange}
            placeholder={state.isLocalProvider ? "(optional)" : "sk-..."}
            value={state.apiKey}
          />
        </div>
      </SettingContainer>

      <SettingContainer
        description={
          state.isLocalProvider
            ? "Provide the model identifier expected by your endpoint (e.g., llama3.2 for Ollama)."
            : "Choose a model exposed by the selected provider."
        }
        descriptionMode="tooltip"
        grouped={true}
        layout="stacked"
        title="Model"
      >
        <div className="flex items-center gap-2">
          <ModelSelect
            className="min-w-[380px] flex-1"
            disabled={state.isModelUpdating}
            isLoading={state.isFetchingModels}
            onBlur={() => {}}
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
              <TooltipTrigger asChild>
                <Button
                  aria-label="Refresh models"
                  className="flex h-10 w-10 items-center justify-center"
                  disabled={state.isFetchingModels}
                  onClick={state.handleRefreshModels}
                  size="icon"
                  variant="ghost"
                >
                  <RefreshCcw
                    className={`h-4 w-4 ${state.isFetchingModels ? "animate-spin" : ""}`}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Fetch available models from the provider</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </SettingContainer>
    </>
  );
};

const PostProcessingSettingsPromptsComponent = () => {
  const { getSetting, updateSetting, isUpdating, refreshSettings } =
    useSettings();
  const [isCreating, setIsCreating] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftText, setDraftText] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  const betaEnabled = getSetting("beta_features_enabled") ?? false;
  const prompts = getSetting("post_process_prompts") || [];
  const selectedPromptId = getSetting("post_process_selected_prompt_id") || "";
  const selectedPrompt =
    prompts.find((prompt) => prompt.id === selectedPromptId) || null;

  useEffect(() => {
    if (isCreating) return;

    if (selectedPrompt) {
      setDraftName(selectedPrompt.name);
      setDraftText(selectedPrompt.prompt);
    } else {
      setDraftName("");
      setDraftText("");
    }
  }, [
    isCreating,
    selectedPromptId,
    selectedPrompt?.name,
    selectedPrompt?.prompt,
  ]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  const handlePromptSelect = (promptId: string | null) => {
    if (!promptId) return;
    updateSetting("post_process_selected_prompt_id", promptId);
    setIsCreating(false);
    setIsEditingName(false);
  };

  const handleCreatePrompt = async () => {
    if (!(draftName.trim() && draftText.trim())) return;

    try {
      const newPrompt = await invoke<LLMPrompt>("add_post_process_prompt", {
        name: draftName.trim(),
        prompt: draftText.trim(),
      });
      await refreshSettings();
      updateSetting("post_process_selected_prompt_id", newPrompt.id);
      setIsCreating(false);
    } catch (error) {
      console.error("Failed to create prompt:", error);
    }
  };

  const handleSaveNameEdit = async () => {
    if (!(selectedPromptId && draftName.trim())) return;

    try {
      await invoke("update_post_process_prompt", {
        id: selectedPromptId,
        name: draftName.trim(),
        prompt: selectedPrompt?.prompt ?? draftText.trim(),
      });
      await refreshSettings();
      setIsEditingName(false);
    } catch (error) {
      console.error("Failed to update prompt name:", error);
    }
  };

  const handleCancelNameEdit = () => {
    setIsEditingName(false);
    if (selectedPrompt) {
      setDraftName(selectedPrompt.name);
    }
  };

  const handleUpdatePrompt = async () => {
    if (!(selectedPromptId && draftName.trim() && draftText.trim())) return;

    try {
      await invoke("update_post_process_prompt", {
        id: selectedPromptId,
        name: draftName.trim(),
        prompt: draftText.trim(),
      });
      await refreshSettings();
    } catch (error) {
      console.error("Failed to update prompt:", error);
    }
  };

  const handleDeletePrompt = async (promptId: string) => {
    if (!promptId) return;

    try {
      await invoke("delete_post_process_prompt", { id: promptId });
      await refreshSettings();
      setIsCreating(false);
      setIsEditingName(false);
    } catch (error) {
      console.error("Failed to delete prompt:", error);
    }
  };

  const handleCancelCreate = () => {
    setIsCreating(false);
    if (selectedPrompt) {
      setDraftName(selectedPrompt.name);
      setDraftText(selectedPrompt.prompt);
    } else {
      setDraftName("");
      setDraftText("");
    }
  };

  const handleStartCreate = () => {
    setIsCreating(true);
    setIsEditingName(false);
    setDraftName("");
    setDraftText("");
  };

  const handleStartEditName = () => {
    if (selectedPrompt) {
      setDraftName(selectedPrompt.name);
      setIsEditingName(true);
    }
  };

  if (!betaEnabled) {
    return (
      <DisabledNotice>
        Post processing is available only for beta features. Enable beta mode in
        the Experiments section to configure prompts.
      </DisabledNotice>
    );
  }

  const hasPrompts = prompts.length > 0;
  const isPromptTextDirty =
    !!selectedPrompt && draftText.trim() !== selectedPrompt.prompt.trim();

  return (
    <SettingContainer
      description="Select a template for refining transcriptions or create a new one. Type @output inside the prompt to reference the captured transcript."
      descriptionMode="tooltip"
      grouped={true}
      layout="stacked"
      title="Selected Prompt"
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          {isEditingName && selectedPrompt ? (
            <div className="flex flex-1 items-center gap-1">
              <Input
                className="flex-1"
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSaveNameEdit();
                  } else if (e.key === "Escape") {
                    handleCancelNameEdit();
                  }
                }}
                placeholder="Enter prompt name"
                ref={nameInputRef}
                type="text"
                value={draftName}
              />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      disabled={!draftName.trim()}
                      onClick={handleSaveNameEdit}
                      size="icon"
                      variant="ghost"
                    >
                      <CheckIcon className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Save name</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleCancelNameEdit}
                      size="icon"
                      variant="ghost"
                    >
                      <XIcon className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Cancel</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          ) : (
            <>
              <NativeSelect
                className="flex-1"
                disabled={
                  isUpdating("post_process_selected_prompt_id") ||
                  isCreating ||
                  prompts.length === 0
                }
                onChange={(e) => handlePromptSelect(e.target.value)}
                value={selectedPromptId || ""}
                wrapperClassName="w-full"
              >
                <NativeSelectOption disabled value="">
                  {prompts.length === 0
                    ? "No prompts available"
                    : "Select a prompt"}
                </NativeSelectOption>
                {prompts.map((p) => (
                  <NativeSelectOption key={p.id} value={p.id}>
                    {p.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {selectedPrompt && !isCreating && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        className="shrink-0"
                        onClick={handleStartEditName}
                        size="icon"
                        variant="secondary"
                      >
                        <PencilIcon className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Rename prompt</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="shrink-0"
                  disabled={isCreating || isEditingName}
                  onClick={handleStartCreate}
                  size="icon"
                  variant="secondary"
                >
                  <PlusIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Create a new prompt</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {!isCreating && hasPrompts && selectedPrompt && (
          <div className="space-y-3">
            <div className="flex flex-col space-y-2">
              <div className="flex flex-col gap-1">
                <label className="font-semibold text-sm">
                  Prompt Instructions
                </label>
                <p className="text-muted-foreground text-xs">
                  Write the instructions to run after transcription.
                </p>
              </div>
              <MarkdownEditor
                className="min-h-32"
                onChange={setDraftText}
                placeholder="Start typing..."
                showMentionMenu
                showToolbar
                value={draftText}
              />
              <p className="text-muted-foreground/70 text-xs">
                Tip: Type{" "}
                <code className="rounded bg-muted/20 px-1 py-0.5 text-xs">
                  @output
                </code>{" "}
                to insert the transcribed text placeholder.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                disabled={!isPromptTextDirty}
                onClick={handleUpdatePrompt}
              >
                Save Changes
              </Button>
              <Button
                disabled={!selectedPromptId || prompts.length <= 1}
                onClick={() => handleDeletePrompt(selectedPromptId)}
                variant="secondary"
              >
                Delete Prompt
              </Button>
            </div>
          </div>
        )}

        {!(isCreating || selectedPrompt) && (
          <div className="rounded border border-border/20 bg-muted/5 p-3">
            <p className="text-muted-foreground text-sm">
              {hasPrompts
                ? "Select a prompt above to view and edit its details."
                : "Click 'Create New Prompt' above to create your first post-processing prompt."}
            </p>
          </div>
        )}

        {isCreating && (
          <div className="space-y-3">
            <div className="flex flex-col space-y-2">
              <label className="font-semibold text-sm text-text">
                Prompt Label
              </label>
              <Input
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Enter prompt name"
                type="text"
                value={draftName}
              />
            </div>

            <div className="flex flex-col space-y-2">
              <div className="flex flex-col gap-1">
                <label className="font-semibold text-sm">
                  Prompt Instructions
                </label>
                <p className="text-muted-foreground text-xs">
                  Write the instructions to run after transcription.
                </p>
              </div>
              <MarkdownEditor
                onChange={setDraftText}
                placeholder="Start writing..."
                showMentionMenu
                showToolbar
                value={draftText}
              />
              <p className="text-muted-foreground/70 text-xs">
                Tip: Type{" "}
                <code className="rounded bg-muted/20 px-1 py-0.5 text-xs">
                  @output
                </code>{" "}
                to insert the transcribed text placeholder.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                disabled={!(draftName.trim() && draftText.trim())}
                onClick={handleCreatePrompt}
              >
                Create Prompt
              </Button>
              <Button onClick={handleCancelCreate} variant="secondary">
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </SettingContainer>
  );
};

export const PostProcessingSettingsApi: React.FC & {
  displayName?: string;
} = PostProcessingSettingsApiComponent;
PostProcessingSettingsApi.displayName = "PostProcessingSettingsApi";

export const PostProcessingSettingsPrompts: React.FC & {
  displayName?: string;
} = PostProcessingSettingsPromptsComponent;
PostProcessingSettingsPrompts.displayName = "PostProcessingSettingsPrompts";

export const PostProcessingSettings = () => (
  <div className="mx-auto w-full max-w-3xl pb-20">
    <SettingsGroup title="API (OpenAI Compatible)">
      <PostProcessingSettingsApi />
    </SettingsGroup>

    <SettingsGroup title="Prompt">
      <PostProcessingSettingsPrompts />
    </SettingsGroup>

    <SettingsGroup title="AI SDK Tools (Experimental)">
      <AiSdkToolsToggle descriptionMode="inline" grouped />
    </SettingsGroup>
  </div>
);

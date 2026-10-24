import { Button } from "@ctrl-ui/react/ui/button";
import { Field, FieldLabel } from "@ctrl-ui/react/ui/field";
import { Input } from "@ctrl-ui/react/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ctrl-ui/react/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@ctrl-ui/react/ui/tooltip";
import {
  CheckIcon,
  PencilSimpleIcon,
  PlusIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useId } from "react";
import { MarkdownEditor } from "@/components/editor/markdown-editor";
import { usePromptSettings } from "@/components/settings/post-processing/use-prompt-settings";
import { SettingRow } from "@/features/settings/setting-row";
import type { LLMPrompt } from "@/lib/types";
import { hasTranscriptPlaceholder } from "@/lib/utils/replace-mention-output";
import { useSetting } from "@/stores/settings-store";

const PromptInstructions = ({
  onChange,
  value,
}: {
  onChange: (markdown: string) => void;
  value: string;
}) => {
  const labelId = useId();
  const transcriptPlaceholderIsMissing =
    value.trim() !== "" && !hasTranscriptPlaceholder(value);
  return (
    <div className="flex flex-col gap-2">
      <span className="font-medium text-label" id={labelId}>
        Instructions
      </span>
      <MarkdownEditor
        labelledBy={labelId}
        onChange={onChange}
        placeholder="e.g. Fix spelling and punctuation"
        value={value}
      />
      {transcriptPlaceholderIsMissing ? (
        <p className="flex items-center gap-2 rounded-md bg-amber-500/10 p-2 text-caption text-warning">
          <WarningIcon aria-hidden="true" className="size-4 shrink-0" />
          The transcript will be appended. Type @output to place it elsewhere.
        </p>
      ) : (
        <p className="text-caption text-muted-foreground">
          Type @output to insert the transcript.
        </p>
      )}
    </div>
  );
};
export function PostProcessingSettingsPrompts() {
  const selectedPromptId = useSetting("post_process_selected_prompt_id");
  const prompts = useSetting("post_process_prompts");
  const initialPrompt = prompts?.find(
    (prompt) => prompt.id === selectedPromptId
  );
  return (
    <PromptSettingsEditor
      initialPrompt={initialPrompt}
      key={`${initialPrompt?.id}:${initialPrompt?.name}:${initialPrompt?.prompt}`}
    />
  );
}
function PromptSettingsEditor({
  initialPrompt,
}: {
  initialPrompt: LLMPrompt | undefined;
}) {
  const {
    postProcessEnabled,
    prompts,
    selectedPromptId,
    isPromptIdUpdating,
    isCreating,
    isEditingName,
    draftName,
    draftText,
    setDraftName,
    setDraftText,
    selectedPrompt,
    handlePromptSelect,
    handleCreatePrompt,
    handleSaveNameEdit,
    handleCancelNameEdit,
    handleUpdatePrompt,
    handleDeletePrompt,
    handleCancelCreate,
    handleStartCreate,
    handleStartEditName,
  } = usePromptSettings(initialPrompt);
  if (!postProcessEnabled) {
    return (
      <p className="px-4 py-3 text-caption text-muted-foreground">
        Enable post-processing to configure prompts.
      </p>
    );
  }
  const hasPrompts = prompts.length > 0;
  const isPromptTextDirty =
    !!selectedPrompt && draftText.trim() !== selectedPrompt.prompt.trim();
  const renderEditSection = () => {
    if (isCreating || !hasPrompts || !selectedPrompt) {
      return null;
    }
    return (
      <div className="flex flex-col gap-3">
        <PromptInstructions onChange={setDraftText} value={draftText} />
        <div className="flex gap-2">
          <Button
            disabled={!isPromptTextDirty}
            onClick={handleUpdatePrompt}
            tone="primary"
            variant="solid"
          >
            Save changes
          </Button>
          <Button
            disabled={!selectedPromptId || prompts.length <= 1}
            onClick={() => handleDeletePrompt(selectedPromptId)}
            variant="surface"
          >
            Delete prompt
          </Button>
        </div>
      </div>
    );
  };
  const renderEmptyState = () => {
    if (isCreating || selectedPrompt) {
      return null;
    }
    return (
      <p className="text-caption text-muted-foreground">
        {hasPrompts
          ? "Select a prompt to edit it."
          : "Create a prompt with the + button above."}
      </p>
    );
  };
  const renderCreateSection = () => {
    if (!isCreating) {
      return null;
    }
    return (
      <div className="flex flex-col gap-3">
        <Field className="gap-2">
          <FieldLabel className="font-medium">Name</FieldLabel>
          <Input
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="e.g. Meeting notes"
            type="text"
            value={draftName}
          />
        </Field>
        <PromptInstructions onChange={setDraftText} value={draftText} />
        <div className="flex gap-2">
          <Button
            disabled={!(draftName.trim() && draftText.trim())}
            onClick={handleCreatePrompt}
            tone="primary"
            variant="solid"
          >
            Create prompt
          </Button>
          <Button onClick={handleCancelCreate} variant="surface">
            Cancel
          </Button>
        </div>
      </div>
    );
  };
  return (
    <SettingRow layout="stacked" title="Saved prompt">
      <div className="space-y-3">
        <div className="flex gap-2">
          {isEditingName && selectedPrompt ? (
            <div className="flex flex-1 items-center gap-1">
              <Input
                aria-label="Prompt name"
                autoFocus
                className="flex-1"
                onChange={(e) => setDraftName(e.target.value)}
                onFocus={(event) => event.currentTarget.select()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSaveNameEdit();
                  } else if (e.key === "Escape") {
                    handleCancelNameEdit();
                  }
                }}
                placeholder="e.g. Meeting notes"
                type="text"
                value={draftName}
              />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label="Save name"
                        disabled={!draftName.trim()}
                        iconOnly
                        onClick={handleSaveNameEdit}
                        size="md"
                        variant="ghost"
                      />
                    }
                  >
                    <CheckIcon className="size-4" />
                  </TooltipTrigger>
                  <TooltipContent>Save name</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label="Cancel rename"
                        iconOnly
                        onClick={handleCancelNameEdit}
                        size="md"
                        variant="ghost"
                      />
                    }
                  >
                    <XIcon className="size-4" />
                  </TooltipTrigger>
                  <TooltipContent>Cancel</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          ) : (
            <>
              <Select
                disabled={
                  isPromptIdUpdating || isCreating || prompts.length === 0
                }
                items={[
                  { value: "none", label: "None" },
                  ...prompts.map((prompt) => ({
                    value: prompt.id,
                    label: prompt.name,
                  })),
                ]}
                onValueChange={handlePromptSelect}
                value={selectedPromptId || (prompts.length === 0 ? "" : "none")}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue
                    placeholder={
                      prompts.length === 0
                        ? "No prompts available"
                        : "Select a prompt"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {prompts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPrompt && !isCreating && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          aria-label="Rename prompt"
                          className="shrink-0"
                          iconOnly
                          onClick={handleStartEditName}
                          size="md"
                          variant="surface"
                        />
                      }
                    >
                      <PencilSimpleIcon className="size-4" />
                    </TooltipTrigger>
                    <TooltipContent>Rename prompt</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label="Create prompt"
                    className="shrink-0"
                    disabled={isCreating || isEditingName}
                    iconOnly
                    onClick={handleStartCreate}
                    size="md"
                    variant="surface"
                  />
                }
              >
                <PlusIcon />
              </TooltipTrigger>
              <TooltipContent>Create a new prompt</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {renderEditSection()}

        {renderEmptyState()}

        {renderCreateSection()}
      </div>
    </SettingRow>
  );
}

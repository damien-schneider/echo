import { Button } from "@ctrl-ui/react/ui/button";
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
  AlertTriangle,
  CheckIcon,
  PencilIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { MarkdownEditor } from "@/components/editor/markdown-editor";
import { usePromptSettings } from "@/components/settings/post-processing/use-prompt-settings";
import { SettingRow } from "@/features/settings/setting-row";
import type { LLMPrompt } from "@/lib/types";
import { useSetting } from "@/stores/settings-store";

const MENTION_OUTPUT_REGEX = /\[[^\]]*\]\(mention:output\)/;
const OUTPUT_TEMPLATE = ["$", "{output}"].join("");
const hasMissingOutputPlaceholder = (text: string): boolean =>
  text.trim() !== "" &&
  !text.includes("@output") &&
  !text.includes(OUTPUT_TEMPLATE) &&
  !MENTION_OUTPUT_REGEX.test(text);
const OutputPlaceholderWarning = () => (
  <div className="flex items-center gap-2 rounded-md bg-amber-500/10 p-2 text-warning">
    <AlertTriangle className="h-4 w-4" />
    <p className="text-xs">
      The transcript will be appended. Add @output to place it elsewhere.
    </p>
  </div>
);
const DisabledNotice = ({ children }: { children: React.ReactNode }) => (
  <div className="px-4 py-3">
    <p className="text-muted-foreground text-sm">{children}</p>
  </div>
);
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
      <DisabledNotice>
        Enable post-processing to configure prompts.
      </DisabledNotice>
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
      <div className="space-y-3">
        <div className="flex flex-col space-y-2">
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-sm">Instructions</span>
          </div>
          <MarkdownEditor
            className="min-h-32"
            onChange={setDraftText}
            placeholder="e.g. Fix spelling and punctuation"
            showMentionMenu
            showToolbar
            value={draftText}
          />
          <p className="text-muted-foreground text-xs">
            Use{" "}
            <code className="rounded bg-muted/20 px-1 py-0.5 text-xs">
              @output
            </code>{" "}
            to insert the transcript.
          </p>
          {hasMissingOutputPlaceholder(draftText) && (
            <OutputPlaceholderWarning />
          )}
        </div>

        <div className="flex gap-2 pt-2">
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
      <div className="rounded border border-border/20 bg-muted/5 p-3">
        <p className="text-muted-foreground text-sm">
          {hasPrompts
            ? "Select a prompt to edit it."
            : "Create a prompt with the + button above."}
        </p>
      </div>
    );
  };
  const renderCreateSection = () => {
    if (!isCreating) {
      return null;
    }
    return (
      <div className="space-y-3">
        <div className="flex flex-col space-y-2">
          <label className="font-medium text-sm" htmlFor="new-prompt-name">
            Name
          </label>
          <Input
            id="new-prompt-name"
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="e.g. Meeting notes"
            type="text"
            value={draftName}
          />
        </div>

        <div className="flex flex-col space-y-2">
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-sm">Instructions</span>
          </div>
          <MarkdownEditor
            onChange={setDraftText}
            placeholder="e.g. Fix spelling and punctuation"
            showMentionMenu
            showToolbar
            value={draftText}
          />
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-xs">
              Use{" "}
              <code className="rounded bg-muted/20 px-1 py-0.5 text-xs">
                @output
              </code>{" "}
              to insert the transcript.
            </p>
            {hasMissingOutputPlaceholder(draftText) && (
              <OutputPlaceholderWarning />
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
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
                      <PencilIcon className="size-4" />
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

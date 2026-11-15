import { Button } from "@ctrl-ui/react/ui/button";
import { Field, FieldLabel } from "@ctrl-ui/react/ui/field";
import { Input } from "@ctrl-ui/react/ui/input";
import { Text } from "@ctrl-ui/react/ui/typography";
import { useId, useState } from "react";
import { MarkdownEditor } from "@/components/editor/markdown-editor";
import type { PromptDraft } from "@/components/settings/prompts/use-prompt-actions";
import { ConfirmDeleteButton } from "@/components/shared/confirm-delete-button";

interface PromptFormProps {
  initial: PromptDraft;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
  onSubmit: (draft: PromptDraft) => Promise<void>;
  submitLabel: string;
}

export const PromptForm = ({
  initial,
  onCancel,
  onDelete,
  onSubmit,
  submitLabel,
}: PromptFormProps) => {
  const instructionLabelId = useId();
  const [name, setName] = useState(initial.name);
  const [instruction, setInstruction] = useState(initial.instruction);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isComplete = name.trim() !== "" && instruction.trim() !== "";
  const isChanged =
    name.trim() !== initial.name || instruction.trim() !== initial.instruction;

  const submit = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await onSubmit({ instruction: instruction.trim(), name: name.trim() });
    } catch (submitError) {
      setError(String(submitError));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Field className="gap-2">
        <FieldLabel>Name</FieldLabel>
        <Input
          autoFocus
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Translate"
          value={name}
        />
      </Field>
      <div className="flex flex-col gap-2">
        <Text id={instructionLabelId} size="label" weight="medium">
          Instruction
        </Text>
        <MarkdownEditor
          labelledBy={instructionLabelId}
          onChange={setInstruction}
          placeholder="e.g. Translate the text into English"
          value={instruction}
        />
        <Text size="caption" tone="muted">
          Say what to do with the text. Where it comes from and where the result
          goes depends on Dictation, Polish or Chat.
        </Text>
      </div>
      {error ? (
        <Text role="alert" size="caption" tone="danger">
          {error}
        </Text>
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          disabled={!(isComplete && isChanged) || isSaving}
          onClick={submit}
          tone="primary"
          variant="solid"
        >
          {submitLabel}
        </Button>
        <Button onClick={onCancel} variant="surface">
          Cancel
        </Button>
        {onDelete ? (
          <span className="ml-auto">
            <ConfirmDeleteButton label="Delete prompt" onDelete={onDelete} />
          </span>
        ) : null}
      </div>
    </div>
  );
};

import { Button } from "@ctrl-ui/react/ui/button";
import { Text } from "@ctrl-ui/react/ui/typography";
import {
  LockSimpleIcon,
  PencilSimpleIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { PromptForm } from "@/components/settings/prompts/prompt-form";
import { usePromptActions } from "@/components/settings/prompts/use-prompt-actions";
import type { PromptEntry } from "@/features/prompts/prompt-library-store";
import { SettingRow } from "@/features/settings/setting-row";

const NEW_PROMPT = "new";

interface PromptRowProps {
  entry: PromptEntry;
  isOpen: boolean;
  onClose: () => void;
  onToggle: () => void;
}

const PromptRow = ({ entry, isOpen, onClose, onToggle }: PromptRowProps) => {
  const actions = usePromptActions();
  const Icon = entry.locked ? LockSimpleIcon : PencilSimpleIcon;
  return (
    <>
      <SettingRow title={entry.name}>
        <Button
          aria-expanded={isOpen}
          onClick={onToggle}
          size="sm"
          variant="ghost"
        >
          <Icon aria-hidden="true" />
          {entry.locked ? "View" : "Edit"}
        </Button>
      </SettingRow>
      {isOpen && entry.locked ? (
        <Text size="caption" tone="muted">
          {entry.instruction}
        </Text>
      ) : null}
      {isOpen && !entry.locked ? (
        <PromptForm
          initial={{ instruction: entry.instruction, name: entry.name }}
          onCancel={onClose}
          onDelete={async () => {
            await actions.remove(entry.id);
            onClose();
          }}
          onSubmit={async (draft) => {
            await actions.update(entry.id, draft);
            onClose();
          }}
          submitLabel="Save"
        />
      ) : null}
    </>
  );
};

export const PromptList = ({ entries }: { entries: PromptEntry[] }) => {
  const actions = usePromptActions();
  const [openId, setOpenId] = useState<string | null>(null);
  const close = () => setOpenId(null);
  return (
    <>
      {entries.map((entry) => (
        <PromptRow
          entry={entry}
          isOpen={openId === entry.id}
          key={entry.id}
          onClose={close}
          onToggle={() => setOpenId(openId === entry.id ? null : entry.id)}
        />
      ))}
      {openId === NEW_PROMPT ? (
        <PromptForm
          initial={{ instruction: "", name: "" }}
          onCancel={close}
          onSubmit={async (draft) => {
            await actions.create(draft);
            close();
          }}
          submitLabel="Create prompt"
        />
      ) : (
        <Button
          className="self-start"
          onClick={() => setOpenId(NEW_PROMPT)}
          size="sm"
          variant="ghost"
        >
          <PlusIcon aria-hidden="true" />
          New prompt
        </Button>
      )}
    </>
  );
};

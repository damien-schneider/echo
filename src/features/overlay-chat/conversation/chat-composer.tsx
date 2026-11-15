import { Button } from "@ctrl-ui/react/ui/button";
import { Input } from "@ctrl-ui/react/ui/input";
import { ArrowUpIcon, MicrophoneIcon, SquareIcon } from "@phosphor-icons/react";
import type { RefObject } from "react";
import {
  PROMPT_MENU_ID,
  promptOptionId,
} from "@/features/overlay-chat/prompt-picker/prompt-menu-list";
import type { PromptMenu } from "@/features/overlay-chat/prompt-picker/use-prompt-menu";
import type { ChatDictation } from "@/features/overlay-chat/use-chat-dictation";
import { cn } from "@/lib/utils";

const ACTION_BUTTON_CLASS =
  "size-8 rounded-full bg-white text-black hover:bg-white/88 focus-visible:ring-1 focus-visible:ring-white/60";
const DICTATION_LABEL = {
  idle: "Dictate a message",
  recording: "Stop dictating",
  transcribing: "Transcribing…",
} as const;
const DictateButton = ({ state, toggle }: ChatDictation) => (
  <Button
    aria-label={DICTATION_LABEL[state]}
    aria-pressed={state === "recording"}
    className={cn(
      "size-8 rounded-full text-white/68 hover:bg-white/10 hover:text-white focus-visible:ring-1 focus-visible:ring-white/45",
      state === "recording" && "bg-white text-black hover:bg-white/88"
    )}
    disabled={state === "transcribing"}
    iconOnly
    onClick={toggle}
    size="sm"
    title={DICTATION_LABEL[state]}
    type="button"
    variant="ghost"
  >
    <MicrophoneIcon className="size-4" />
  </Button>
);
interface ChatComposerProps {
  dictation: ChatDictation;
  input: string;
  inputRef: RefObject<HTMLInputElement | null>;
  isContextLoading: boolean;
  isModelReady: boolean;
  isResponding: boolean;
  menu: PromptMenu;
  onStop: () => void;
  placeholder: string;
}
export const ChatComposer = ({
  dictation,
  input,
  isContextLoading,
  inputRef,
  isModelReady,
  isResponding,
  menu,
  onStop,
  placeholder,
}: ChatComposerProps) => {
  const highlighted = menu.isOpen ? menu.visible.at(menu.highlight) : undefined;
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-2 transition-colors focus-within:border-white/25 focus-within:bg-white/10">
      <Input
        aria-activedescendant={
          highlighted ? promptOptionId(highlighted.value) : undefined
        }
        aria-autocomplete="list"
        aria-controls={menu.isOpen ? PROMPT_MENU_ID : undefined}
        aria-expanded={menu.isOpen}
        className="h-8 min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] text-white shadow-none outline-none placeholder:text-white/50 focus-visible:ring-0"
        onChange={(event) => menu.onInput(event.currentTarget.value)}
        onKeyDown={menu.onKeyDown}
        placeholder={placeholder}
        ref={inputRef}
        role="combobox"
        value={input}
      />
      <DictateButton {...dictation} />
      {isResponding ? (
        <Button
          aria-label="Stop"
          className={ACTION_BUTTON_CLASS}
          iconOnly
          onClick={onStop}
          size="sm"
          tone="primary"
          type="button"
          variant="solid"
        >
          <SquareIcon className="size-3" weight="fill" />
        </Button>
      ) : (
        <Button
          aria-label="Send"
          className={ACTION_BUTTON_CLASS}
          disabled={isContextLoading || !isModelReady || !input.trim()}
          iconOnly
          size="sm"
          tone="primary"
          type="submit"
          variant="solid"
        >
          <ArrowUpIcon className="size-4" />
        </Button>
      )}
    </div>
  );
};

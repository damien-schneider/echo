import { ArrowUp, Mic, Square } from "lucide-react";
import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    onClick={toggle}
    size="icon-sm"
    title={DICTATION_LABEL[state]}
    type="button"
    variant="ghost"
  >
    <Mic className="size-4" />
  </Button>
);

interface ChatComposerProps {
  dictation: ChatDictation;
  input: string;
  inputRef: RefObject<HTMLInputElement | null>;
  isContextLoading: boolean;
  isModelReady: boolean;
  isResponding: boolean;
  onInput: (value: string) => void;
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
  onInput,
  onStop,
  placeholder,
}: ChatComposerProps) => (
  <div className="flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-2 transition-colors focus-within:border-white/25 focus-within:bg-white/10">
    <Input
      className="h-8 min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] text-white shadow-none outline-none placeholder:text-white/50 focus-visible:ring-0"
      onChange={(event) => onInput(event.currentTarget.value)}
      placeholder={placeholder}
      ref={inputRef}
      value={input}
      variant="default"
    />
    <DictateButton {...dictation} />
    {isResponding ? (
      <Button
        aria-label="Stop"
        className={ACTION_BUTTON_CLASS}
        onClick={onStop}
        size="icon-sm"
        type="button"
      >
        <Square className="size-3 fill-current" />
      </Button>
    ) : (
      <Button
        aria-label="Send"
        className={ACTION_BUTTON_CLASS}
        disabled={isContextLoading || !isModelReady || !input.trim()}
        size="icon-sm"
        type="submit"
      >
        <ArrowUp className="size-4" />
      </Button>
    )}
  </div>
);

import { AudioLines, Check, Copy, MessageSquareText, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface TranscriptPanelProps {
  onClose: () => void;
  onCopy: () => Promise<void>;
  onSendToChat: () => void;
  text: string;
}

const TRANSCRIPT_HEADLINE = "Select a textbox first, then dictate";

export const TranscriptPanel = ({
  onClose,
  onCopy,
  onSendToChat,
  text,
}: TranscriptPanelProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const copy = async () => {
    await onCopy();
    setIsCopied(true);
  };
  return (
    <dialog
      aria-label="Dictated text Echo could not place"
      className="echo-island-panel m-0 flex flex-col gap-3 border-0"
      open={true}
    >
      <div className="flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/8">
          <AudioLines aria-hidden="true" className="size-4 text-white/70" />
        </span>
        <p className="min-w-0 flex-1 text-center text-[12px] text-white/58">
          {TRANSCRIPT_HEADLINE}
        </p>
        <Button
          aria-label="Dismiss the dictated text"
          className="size-7 shrink-0 rounded-full text-white/55 hover:bg-white/10 hover:text-white"
          onClick={onClose}
          size="icon-xs"
          variant="ghost"
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      <p className="max-h-20 overflow-y-auto text-[15px] text-white leading-snug">
        {text}
      </p>
      <div className="mt-auto flex items-center justify-end gap-2">
        <Button
          aria-label="Send the dictated text to Echo chat"
          className="size-9 rounded-full bg-white/8 text-white/80 hover:bg-white/14 hover:text-white"
          onClick={onSendToChat}
          size="icon"
          title="Send to chat"
          variant="ghost"
        >
          <MessageSquareText aria-hidden="true" className="size-4" />
        </Button>
        <Button
          className="rounded-full bg-white/12 px-4 text-white hover:bg-white/20"
          onClick={copy}
          size="sm"
        >
          {isCopied ? (
            <Check aria-hidden="true" className="size-4" />
          ) : (
            <Copy aria-hidden="true" className="size-4" />
          )}
          {isCopied ? "Copied" : "Copy"}
        </Button>
      </div>
    </dialog>
  );
};

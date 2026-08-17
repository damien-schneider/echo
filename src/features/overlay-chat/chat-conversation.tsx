import { ArrowUp, Loader2 } from "lucide-react";
import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CHAT_ROLES, type ChatMessage } from "@/features/overlay-chat/chat";
import { cn } from "@/lib/utils";

interface MessageListProps {
  error: string;
  isResponding: boolean;
  messages: ChatMessage[];
  viewportRef: RefObject<HTMLDivElement | null>;
}

const messageContent = (message: ChatMessage, isResponding: boolean) => {
  if (message.content) {
    return message.content;
  }
  return message.role === CHAT_ROLES.assistant && isResponding ? (
    <span className="inline-flex items-center gap-2 text-white/58">
      <Loader2 className="size-3 animate-spin" />
      Thinking
    </span>
  ) : null;
};

export const MessageList = ({
  error,
  isResponding,
  messages,
  viewportRef,
}: MessageListProps) => {
  if (messages.length === 0 && !error) {
    return null;
  }
  return (
    <ScrollArea
      className="min-h-0 flex-1"
      classNameViewport="select-none space-y-3 pr-2"
      scrollbars="vertical"
      showMask={true}
      viewportRef={viewportRef}
    >
      {messages.map((message) => (
        <div
          className={cn(
            "min-w-0 break-words text-[13px] leading-relaxed [overflow-wrap:anywhere]",
            message.role === CHAT_ROLES.user
              ? "ml-auto w-fit max-w-[82%] rounded-2xl bg-white px-3 py-2 text-black"
              : "mr-auto max-w-full px-1 py-1 text-white/88"
          )}
          data-chat-role={message.role}
          key={message.id}
        >
          <span
            className={cn(
              "echo-chat-message-text cursor-text select-text whitespace-pre-wrap",
              message.role === CHAT_ROLES.user
                ? "selection:bg-black/20"
                : "selection:bg-white/20"
            )}
            data-component="chat-message-text"
          >
            {messageContent(message, isResponding)}
          </span>
        </div>
      ))}
      {error ? (
        <div className="break-words rounded-xl bg-red-500/15 px-3 py-2 text-[13px] text-red-100 [overflow-wrap:anywhere]">
          {error}
        </div>
      ) : null}
    </ScrollArea>
  );
};

interface ChatComposerProps {
  input: string;
  inputRef: RefObject<HTMLInputElement | null>;
  isContextLoading: boolean;
  isModelReady: boolean;
  isResponding: boolean;
  onInput: (value: string) => void;
  placeholder: string;
}

export const ChatComposer = ({
  input,
  isContextLoading,
  inputRef,
  isModelReady,
  isResponding,
  onInput,
  placeholder,
}: ChatComposerProps) => (
  <div className="flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-2 transition-colors focus-within:border-white/25 focus-within:bg-white/10">
    <Input
      className="h-8 min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] text-white shadow-none outline-none placeholder:text-white/50 focus-visible:ring-0"
      disabled={isResponding}
      onChange={(event) => onInput(event.currentTarget.value)}
      placeholder={placeholder}
      ref={inputRef}
      value={input}
      variant="default"
    />
    <Button
      aria-label="Send"
      className="size-8 rounded-full bg-white text-black hover:bg-white/88 focus-visible:ring-1 focus-visible:ring-white/60"
      disabled={
        isResponding || isContextLoading || !isModelReady || !input.trim()
      }
      size="icon-sm"
      type="submit"
    >
      {isResponding ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <ArrowUp className="size-4" />
      )}
    </Button>
  </div>
);

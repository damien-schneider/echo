import { ArrowUp, Loader2, X } from "lucide-react";
import type { FormEvent, RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CHAT_MODEL_MODES,
  CHAT_ROLES,
  type ChatMessage,
} from "@/features/overlay-chat/chat";
import { ChatModelPicker } from "@/features/overlay-chat/chat-model-picker";
import { useChatSession } from "@/features/overlay-chat/use-chat-session";
import { cn } from "@/lib/utils";

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface MessageListProps {
  error: string;
  isResponding: boolean;
  messages: ChatMessage[];
  viewportRef: RefObject<HTMLDivElement | null>;
}

const AssistantPlaceholder = () => (
  <span className="inline-flex items-center gap-2 text-white/58">
    <Loader2 className="size-3 animate-spin" />
    Thinking
  </span>
);

const messageContent = (message: ChatMessage, isResponding: boolean) => {
  if (message.content) {
    return message.content;
  }
  return message.role === CHAT_ROLES.assistant && isResponding ? (
    <AssistantPlaceholder />
  ) : null;
};

const MessageList = ({
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
      classNameViewport="space-y-3 pr-2"
      scrollbars="vertical"
      showMask={true}
      viewportRef={viewportRef}
    >
      {messages.map((message) => (
        <div
          className={cn(
            "max-w-[92%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] leading-relaxed",
            message.role === CHAT_ROLES.user
              ? "ml-auto bg-white text-black"
              : "bg-white/8 text-white/88"
          )}
          key={message.id}
        >
          {messageContent(message, isResponding)}
        </div>
      ))}
      {error ? (
        <div className="rounded-2xl bg-red-500/15 px-3 py-2 text-[13px] text-red-100">
          {error}
        </div>
      ) : null}
    </ScrollArea>
  );
};

interface ChatComposerProps {
  input: string;
  inputRef: RefObject<HTMLInputElement | null>;
  isResponding: boolean;
  onInput: (value: string) => void;
}

const ChatComposer = ({
  input,
  inputRef,
  isResponding,
  onInput,
}: ChatComposerProps) => (
  <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-2">
    <Input
      className="h-8 min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] text-white shadow-none outline-none placeholder:text-white/35 focus-visible:ring-0"
      disabled={isResponding}
      onChange={(event) => onInput(event.currentTarget.value)}
      placeholder="Ask anything"
      ref={inputRef}
      value={input}
      variant="default"
    />
    <Button
      aria-label="Send"
      className="size-8 rounded-full bg-white text-black hover:bg-white/88"
      disabled={isResponding || !input.trim()}
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

interface ChatHeaderProps {
  chat: ReturnType<typeof useChatSession>;
  onClose: () => void;
}

const ChatHeader = ({ chat, onClose }: ChatHeaderProps) => (
  <div className="flex shrink-0 items-center justify-between gap-2">
    <ChatModelPicker
      allOptions={chat.options}
      disabled={chat.isResponding}
      mode={chat.mode}
      onModeSelect={chat.selectMode}
      onSelect={chat.selectModel}
      options={chat.modelOptions}
      selected={chat.selected}
    />
    <Button
      aria-label="Close chat"
      className="size-7 rounded-full bg-white/8 text-white/80 hover:bg-white/14 hover:text-white"
      onClick={onClose}
      size="icon-xs"
      type="button"
    >
      <X className="size-3.5" />
    </Button>
  </div>
);

export function ChatPanel({ isOpen, onClose }: ChatPanelProps) {
  const chat = useChatSession(isOpen);
  const hasConversation =
    chat.messages.length > 0 || chat.isResponding || chat.error.length > 0;
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    chat.send();
  };
  return (
    <div
      className={cn(
        "flex min-h-0 flex-col gap-3 px-3 pt-3 pb-3 transition-[height,box-shadow,background-color] duration-300",
        chat.mode === CHAT_MODEL_MODES.cloud &&
          "rounded-[22px] bg-sky-500/8 shadow-[0_0_34px_rgba(14,165,233,0.25)] ring-1 ring-sky-400/70",
        hasConversation ? "h-[430px]" : "h-[94px]"
      )}
    >
      <ChatHeader chat={chat} onClose={onClose} />
      <MessageList
        error={chat.error}
        isResponding={chat.isResponding}
        messages={chat.messages}
        viewportRef={chat.viewportRef}
      />
      <form className="shrink-0" onSubmit={handleSubmit}>
        <ChatComposer
          input={chat.input}
          inputRef={chat.inputRef}
          isResponding={chat.isResponding}
          onInput={chat.setInput}
        />
      </form>
    </div>
  );
}

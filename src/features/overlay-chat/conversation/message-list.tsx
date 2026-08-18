import { Loader2 } from "lucide-react";
import { lazy, Suspense } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CHAT_ROLES, type ChatMessage } from "@/features/overlay-chat/chat";
import { useStickToBottom } from "@/features/overlay-chat/conversation/use-stick-to-bottom";
import { cn } from "@/lib/utils";

/// Markdown and syntax highlighting stay out of the HUD's startup graph.
const AssistantMarkdown = lazy(async () => ({
  default: (
    await import("@/features/overlay-chat/conversation/assistant-markdown")
  ).AssistantMarkdown,
}));

const PlainText = ({ text }: { text: string }) => (
  <span
    className="cursor-text select-text whitespace-pre-wrap"
    data-component="chat-message-text"
  >
    {text}
  </span>
);

const PendingAnswer = () => (
  <span className="inline-flex items-center gap-2 text-white/58">
    <Loader2 aria-hidden="true" className="size-3 animate-spin" />
    Thinking
  </span>
);

interface MessageBodyProps {
  isStreaming: boolean;
  message: ChatMessage;
}

const MessageBody = ({ isStreaming, message }: MessageBodyProps) => {
  if (message.role === CHAT_ROLES.user) {
    return <PlainText text={message.content} />;
  }
  if (!message.content) {
    return <PendingAnswer />;
  }
  return (
    <Suspense fallback={<PlainText text={message.content} />}>
      <AssistantMarkdown isStreaming={isStreaming} text={message.content} />
    </Suspense>
  );
};

interface MessageListProps {
  error: string;
  isResponding: boolean;
  messages: ChatMessage[];
}

export const MessageList = ({
  error,
  isResponding,
  messages,
}: MessageListProps) => {
  const lastMessage = messages.at(-1);
  const lastUserMessageId =
    messages.filter((message) => message.role === CHAT_ROLES.user).at(-1)?.id ??
    "";
  const { contentRef, viewportRef } = useStickToBottom(lastUserMessageId);
  return (
    <ScrollArea
      className="min-h-0 flex-1"
      classNameViewport="select-none pr-2"
      scrollbars="vertical"
      showMask={true}
      viewportRef={viewportRef}
    >
      <div className="space-y-3" ref={contentRef}>
        {messages.map((message) => (
          <div
            className={cn(
              "min-w-0 break-words text-[13px] leading-relaxed [overflow-wrap:anywhere]",
              message.role === CHAT_ROLES.user
                ? "ml-auto w-fit max-w-[82%] rounded-2xl bg-white px-3 py-2 text-black selection:bg-black/20"
                : "mr-auto max-w-full px-1 py-1 text-white/88 selection:bg-white/20"
            )}
            data-chat-role={message.role}
            key={message.id}
          >
            <MessageBody
              isStreaming={isResponding && message.id === lastMessage?.id}
              message={message}
            />
          </div>
        ))}
        {error ? (
          <div className="break-words rounded-xl bg-red-500/15 px-3 py-2 text-[13px] text-red-100 [overflow-wrap:anywhere]">
            {error}
          </div>
        ) : null}
      </div>
    </ScrollArea>
  );
};

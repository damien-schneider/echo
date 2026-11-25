import { ScrollArea } from "@ctrl-ui/react/ui/scroll-area";
import { AnimatePresence, m } from "motion/react";
import { lazy, type ReactNode, Suspense } from "react";
import {
  CHAT_ROLES,
  type ChatMessage,
  visibleMessages,
} from "@/features/overlay-chat/chat";
import { useStickToBottom } from "@/features/overlay-chat/conversation/use-stick-to-bottom";
import { cn } from "@/lib/utils";

const AssistantMarkdown = lazy(async () => ({
  default: (
    await import("@/features/overlay-chat/conversation/assistant-markdown")
  ).AssistantMarkdown,
}));
const MESSAGE_ENTRANCE = {
  animate: { filter: "blur(0px)", opacity: 1 },
  initial: { filter: "blur(4px)", opacity: 0 },
  transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
} as const;
const PlainText = ({ text }: { text: string }) => (
  <span
    className="cursor-text select-text whitespace-pre-wrap"
    data-component="chat-message-text"
  >
    {text}
  </span>
);
const PendingAnswer = ({ isThinking }: { isThinking: boolean }) => (
  <output className="echo-chat-shimmer shimmer-text">
    {isThinking ? "Thinking…" : "Answering…"}
  </output>
);
interface MessageBodyProps {
  isStreaming: boolean;
  isThinking: boolean;
  message: ChatMessage;
}
const MessageBody = ({
  isStreaming,
  isThinking,
  message,
}: MessageBodyProps) => {
  if (message.role === CHAT_ROLES.user) {
    return <PlainText text={message.content} />;
  }
  if (!message.content) {
    return <PendingAnswer isThinking={isThinking} />;
  }
  return (
    <Suspense fallback={<PlainText text={message.content} />}>
      <AssistantMarkdown isStreaming={isStreaming} text={message.content} />
    </Suspense>
  );
};
interface EnteringRowProps {
  chatRole?: ChatMessage["role"];
  children: ReactNode;
  className: string;
}
const EnteringRow = ({ chatRole, children, className }: EnteringRowProps) => (
  <m.div {...MESSAGE_ENTRANCE} className={className} data-chat-role={chatRole}>
    {children}
  </m.div>
);
interface MessageListProps {
  error: string;
  isResponding: boolean;
  isThinking: boolean;
  messages: ChatMessage[];
}
export const MessageList = ({
  error,
  isResponding,
  isThinking,
  messages,
}: MessageListProps) => {
  const rows = visibleMessages(messages);
  const lastMessage = messages.at(-1);
  const lastUserMessageId =
    messages.filter((message) => message.role === CHAT_ROLES.user).at(-1)?.id ??
    "";
  const { contentRef, viewportRef } = useStickToBottom(lastUserMessageId);
  return (
    <ScrollArea
      className={cn("min-h-0", rows.length === 0 && !error && "hidden")}
      lockAxis="x"
      mask={true}
      viewportClassName="h-auto min-h-0 select-none pr-2"
      viewportProps={{ "data-slot": "scroll-area-viewport" }}
      viewportRef={viewportRef}
    >
      <div className="space-y-3" ref={contentRef}>
        <AnimatePresence initial={false}>
          {rows.map((message) => (
            <EnteringRow
              chatRole={message.role}
              className={cn(
                "min-w-0 break-words text-[13px] leading-relaxed [overflow-wrap:anywhere]",
                message.role === CHAT_ROLES.user
                  ? "ml-auto w-fit max-w-[82%] rounded-2xl bg-white px-3 py-2 text-black selection:bg-black/20"
                  : "mr-auto max-w-full px-1 py-1 text-white/88 selection:bg-white/20"
              )}
              key={message.id}
            >
              <MessageBody
                isStreaming={isResponding && message.id === lastMessage?.id}
                isThinking={isThinking}
                message={message}
              />
            </EnteringRow>
          ))}
          {error ? (
            <EnteringRow
              className="break-words rounded-xl bg-red-500/15 px-3 py-2 text-[13px] text-red-100 [overflow-wrap:anywhere]"
              key="error"
            >
              {error}
            </EnteringRow>
          ) : null}
        </AnimatePresence>
      </div>
    </ScrollArea>
  );
};

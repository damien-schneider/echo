import { Button } from "@ctrl-ui/react/ui/button";
import { XIcon } from "@phosphor-icons/react";
import type { FormEvent, ReactNode } from "react";
import {
  type BundledChatModel,
  BundledModelSetup,
  ChatReference,
} from "@/features/overlay-chat/chat-context";
import { ChatComposer } from "@/features/overlay-chat/conversation/chat-composer";
import { MessageList } from "@/features/overlay-chat/conversation/message-list";
import {
  type ChatSession,
  useChatSession,
} from "@/features/overlay-chat/use-chat-session";
import { IslandHud } from "@/features/overlay-controls/island-hud";
import type {
  ChatContextEvent,
  ChatTextContext,
} from "@/features/overlay-controls/runtime/overlay-windows";
import "@/features/overlay-chat/chat-panel.css";
interface ChatPanelProps {
  bundledModel: BundledChatModel;
  context: ChatTextContext | null;
  contextState: ChatContextEvent["state"];
  hasFlanks: boolean;
  isOpen: boolean;
  onClose: () => void;
  onRequestAccessibility: () => Promise<void>;
}
const ChatModelLabel = () => (
  <span className="flex h-8 shrink-0 items-center rounded-full border border-white/10 bg-white/7 px-3 text-[11px] text-white/62">
    Echo 4B
  </span>
);
const CloseChatButton = ({ onClose }: { onClose: () => void }) => (
  <Button
    aria-label="Close chat"
    className="size-7 shrink-0 rounded-full bg-white/8 text-white/80 hover:bg-white/14 hover:text-white focus-visible:ring-1 focus-visible:ring-white/45"
    iconOnly
    onClick={onClose}
    size="xs"
    tone="primary"
    type="button"
    variant="solid"
  >
    <XIcon aria-hidden="true" className="size-3.5" />
  </Button>
);
interface ChatPanelShellProps {
  children: ReactNode;
  hasFlanks: boolean;
  onClose: () => void;
  panelHeightClass: string;
}
const ChatPanelShell = ({
  children,
  hasFlanks,
  panelHeightClass,
  onClose,
}: ChatPanelShellProps) => (
  <IslandHud
    bodyClassName="flex min-h-0 min-w-0 flex-1 flex-col gap-3"
    className={`echo-island-chat min-h-0 min-w-0 max-w-full p-3 ${panelHeightClass}`}
    hasFlanks={hasFlanks}
    layout="chat"
    leftFlank={<ChatModelLabel />}
    rightFlank={<CloseChatButton onClose={onClose} />}
  >
    {children}
  </IslandHud>
);
interface ChatPanelContentProps {
  bundledModel: BundledChatModel;
  chat: ChatSession;
  context: ChatTextContext | null;
  contextState: ChatContextEvent["state"];
  hasConversation: boolean;
  isBundledModelReady: boolean;
  onRequestAccessibility: () => Promise<void>;
}
const ChatPanelContent = ({
  bundledModel,
  chat,
  context,
  contextState,
  hasConversation,
  isBundledModelReady,
  onRequestAccessibility,
}: ChatPanelContentProps) => {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    chat.send();
  };
  return (
    <>
      <ChatReference
        context={context}
        onRequestAccessibility={onRequestAccessibility}
        state={contextState}
      />
      <BundledModelSetup model={bundledModel} />
      {hasConversation ? (
        <MessageList
          error={chat.error}
          isResponding={chat.isResponding}
          messages={chat.messages}
        />
      ) : null}
      <form className="mt-auto w-full min-w-0 shrink-0" onSubmit={handleSubmit}>
        <ChatComposer
          dictation={chat.dictation}
          input={chat.input}
          inputRef={chat.inputRef}
          isContextLoading={contextState === "loading"}
          isModelReady={isBundledModelReady}
          isResponding={chat.isResponding}
          onInput={chat.setInput}
          onStop={chat.stop}
          placeholder={context ? "Ask about this text" : "Ask anything"}
        />
      </form>
    </>
  );
};
export const ChatPanel = ({
  bundledModel,
  context,
  contextState,
  hasFlanks,
  isOpen,
  onClose,
  onRequestAccessibility,
}: ChatPanelProps) => {
  const isBundledModelReady = bundledModel.status.state === "ready";
  const chat = useChatSession({
    context,
    contextState,
    isBundledModelReady,
    isOpen,
  });
  const hasConversation =
    chat.messages.length > 0 || chat.isResponding || chat.error.length > 0;
  const panelHeightClass = hasConversation
    ? "h-[430px] max-h-[calc(100vh-16px)]"
    : "min-h-[172px]";
  return (
    <ChatPanelShell
      hasFlanks={hasFlanks}
      onClose={onClose}
      panelHeightClass={panelHeightClass}
    >
      <ChatPanelContent
        bundledModel={bundledModel}
        chat={chat}
        context={context}
        contextState={contextState}
        hasConversation={hasConversation}
        isBundledModelReady={isBundledModelReady}
        onRequestAccessibility={onRequestAccessibility}
      />
    </ChatPanelShell>
  );
};

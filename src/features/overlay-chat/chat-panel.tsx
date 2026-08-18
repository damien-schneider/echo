import { X } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  CHAT_MODEL_KINDS,
  CHAT_MODEL_MODES,
} from "@/features/overlay-chat/chat";
import {
  type BundledChatModel,
  BundledModelSetup,
  ChatReference,
} from "@/features/overlay-chat/chat-context";
import {
  ChatModelPicker,
  ChatModePicker,
} from "@/features/overlay-chat/chat-model-picker";
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
import { cn } from "@/lib/utils";
import "@/features/overlay-chat/chat-panel.css";

interface ChatPanelProps {
  bundledModel: BundledChatModel;
  context: ChatTextContext | null;
  contextState: ChatContextEvent["state"];
  hasFlanks: boolean;
  isOpen: boolean;
  onClose: () => void;
  onManageModels: () => void;
  onRefreshContext: () => Promise<ChatTextContext | null>;
  onRequestAccessibility: () => Promise<void>;
}

interface ChatToolbarRightProps {
  chat: ChatSession;
  onClose: () => void;
  onManageModels: () => void;
}

const ChatToolbarRight = ({
  chat,
  onClose,
  onManageModels,
}: ChatToolbarRightProps) => (
  <div className="echo-chat-toolbar-right flex w-full min-w-0 max-w-[218px] items-center justify-between gap-2">
    <ChatModelPicker
      disabled={chat.isResponding}
      mode={chat.mode}
      onManageModels={onManageModels}
      onSelect={chat.selectModel}
      options={chat.modelOptions}
      selected={chat.selected}
    />
    <Button
      aria-label="Close chat"
      className="size-7 shrink-0 rounded-full bg-white/8 text-white/80 hover:bg-white/14 hover:text-white focus-visible:ring-1 focus-visible:ring-white/45"
      onClick={onClose}
      size="icon-xs"
      type="button"
    >
      <X aria-hidden="true" className="size-3.5" />
    </Button>
  </div>
);

interface ChatPanelShellProps {
  chat: ChatSession;
  children: ReactNode;
  hasFlanks: boolean;
  onClose: () => void;
  onManageModels: () => void;
  panelHeightClass: string;
}

const ChatPanelShell = ({
  chat,
  children,
  hasFlanks,
  panelHeightClass,
  onClose,
  onManageModels,
}: ChatPanelShellProps) => (
  <IslandHud
    bodyClassName="flex min-h-0 min-w-0 flex-1 flex-col gap-3"
    className={cn(
      "echo-island-chat min-h-0 min-w-0 max-w-full p-3 transition-colors duration-300",
      chat.mode === CHAT_MODEL_MODES.cloud &&
        "bg-sky-500/8 ring-1 ring-sky-400/55",
      panelHeightClass
    )}
    hasFlanks={hasFlanks}
    layout="chat"
    leftFlank={
      <ChatModePicker
        disabled={chat.isResponding}
        mode={chat.mode}
        onSelect={chat.selectMode}
      />
    }
    rightFlank={
      <ChatToolbarRight
        chat={chat}
        onClose={onClose}
        onManageModels={onManageModels}
      />
    }
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
  isSelectedModelReady: boolean;
  onRefreshContext: () => Promise<ChatTextContext | null>;
  onRequestAccessibility: () => Promise<void>;
}

const ChatPanelContent = ({
  bundledModel,
  chat,
  context,
  contextState,
  hasConversation,
  isSelectedModelReady,
  onRefreshContext,
  onRequestAccessibility,
}: ChatPanelContentProps) => {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    chat.send(async () => (await onRefreshContext()) ?? context);
  };
  return (
    <>
      <ChatReference
        context={context}
        onRequestAccessibility={onRequestAccessibility}
        state={contextState}
      />
      <BundledModelSetup model={bundledModel} selected={chat.selected} />
      {hasConversation ? (
        <MessageList
          error={chat.error}
          isResponding={chat.isResponding}
          messages={chat.messages}
        />
      ) : null}
      <form className="mt-auto w-full min-w-0 shrink-0" onSubmit={handleSubmit}>
        <ChatComposer
          input={chat.input}
          inputRef={chat.inputRef}
          isContextLoading={contextState === "loading"}
          isModelReady={isSelectedModelReady}
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
  onManageModels,
  onRefreshContext,
  onRequestAccessibility,
}: ChatPanelProps) => {
  const isBundledModelReady = bundledModel.status.state === "ready";
  const chat = useChatSession(isOpen, isBundledModelReady);
  const hasConversation =
    chat.messages.length > 0 || chat.isResponding || chat.error.length > 0;
  const isSelectedModelReady =
    chat.selected?.kind === CHAT_MODEL_KINDS.provider ||
    (chat.selected?.kind === CHAT_MODEL_KINDS.bundled && isBundledModelReady);
  const panelHeightClass = hasConversation
    ? "h-[430px] max-h-[calc(100vh-16px)]"
    : "min-h-[172px]";
  return (
    <ChatPanelShell
      chat={chat}
      hasFlanks={hasFlanks}
      onClose={onClose}
      onManageModels={onManageModels}
      panelHeightClass={panelHeightClass}
    >
      <ChatPanelContent
        bundledModel={bundledModel}
        chat={chat}
        context={context}
        contextState={contextState}
        hasConversation={hasConversation}
        isSelectedModelReady={isSelectedModelReady}
        onRefreshContext={onRefreshContext}
        onRequestAccessibility={onRequestAccessibility}
      />
    </ChatPanelShell>
  );
};

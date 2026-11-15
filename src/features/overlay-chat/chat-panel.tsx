import { Button } from "@ctrl-ui/react/ui/button";
import { CaretDownIcon, XIcon } from "@phosphor-icons/react";
import type { FormEvent, ReactNode } from "react";
import {
  type BundledChatModel,
  BundledModelSetup,
  ChatReference,
} from "@/features/overlay-chat/chat-context";
import { ChatComposer } from "@/features/overlay-chat/conversation/chat-composer";
import { MessageList } from "@/features/overlay-chat/conversation/message-list";
import {
  PROMPT_MENU_ID,
  PromptMenuList,
} from "@/features/overlay-chat/prompt-picker/prompt-menu-list";
import {
  type ChatPromptChoice,
  useChatPrompt,
} from "@/features/overlay-chat/prompt-picker/use-chat-prompt";
import {
  type PromptMenu,
  usePromptMenu,
} from "@/features/overlay-chat/prompt-picker/use-prompt-menu";
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
  onRequestAccessibility: () => Promise<void>;
}
const ChatPromptPill = ({
  label,
  menu,
}: {
  label: string;
  menu: PromptMenu;
}) => (
  <Button
    aria-controls={menu.isOpen ? PROMPT_MENU_ID : undefined}
    aria-expanded={menu.isOpen}
    aria-haspopup="listbox"
    className="h-8 shrink-0 gap-1 rounded-full border border-white/10 bg-white/7 px-3 text-[11px] text-white/72 hover:bg-white/12 hover:text-white focus-visible:ring-1 focus-visible:ring-white/45"
    onClick={menu.toggle}
    onMouseDown={(event) => event.preventDefault()}
    size="xs"
    title="Choose a prompt, or type / in the message"
    type="button"
    variant="ghost"
  >
    {label}
    <CaretDownIcon aria-hidden="true" className="size-3" />
  </Button>
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
  leftFlank: ReactNode;
  onClose: () => void;
  panelHeightClass: string;
}
const ChatPanelShell = ({
  children,
  hasFlanks,
  leftFlank,
  panelHeightClass,
  onClose,
}: ChatPanelShellProps) => (
  <IslandHud
    bodyClassName="flex min-h-0 min-w-0 flex-1 flex-col gap-3"
    className={cn(
      "echo-island-chat min-h-0 min-w-0 max-w-full p-3",
      panelHeightClass
    )}
    hasFlanks={hasFlanks}
    layout="chat"
    leftFlank={leftFlank}
    rightFlank={<CloseChatButton onClose={onClose} />}
  >
    {children}
  </IslandHud>
);
interface ChatPanelContentProps {
  bundledModel: BundledChatModel;
  chat: ChatSession;
  chatPrompt: ChatPromptChoice;
  context: ChatTextContext | null;
  contextState: ChatContextEvent["state"];
  hasConversation: boolean;
  isBundledModelReady: boolean;
  menu: PromptMenu;
  onRequestAccessibility: () => Promise<void>;
}
const composerPlaceholder = (
  prompt: ChatPromptChoice["prompt"],
  context: ChatTextContext | null
) => {
  if (prompt) {
    return `${prompt.name}…`;
  }
  return context ? "Ask about this text" : "Ask anything";
};
const ChatPanelContent = ({
  bundledModel,
  chat,
  chatPrompt,
  context,
  contextState,
  hasConversation,
  isBundledModelReady,
  menu,
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
      <PromptMenuList activeChoice={chatPrompt.activeChoice} menu={menu} />
      <form className="mt-auto w-full min-w-0 shrink-0" onSubmit={handleSubmit}>
        <ChatComposer
          dictation={chat.dictation}
          input={chat.input}
          inputRef={chat.inputRef}
          isContextLoading={contextState === "loading"}
          isModelReady={isBundledModelReady}
          isResponding={chat.isResponding}
          menu={menu}
          onStop={chat.stop}
          placeholder={composerPlaceholder(chatPrompt.prompt, context)}
        />
      </form>
    </>
  );
};
interface PromptedChatOptions {
  context: ChatTextContext | null;
  contextState: ChatContextEvent["state"];
  isBundledModelReady: boolean;
  isOpen: boolean;
}
/// Switching prompt starts over, keeping only what is typed.
const usePromptedChat = (options: PromptedChatOptions) => {
  const chatPrompt = useChatPrompt();
  const chat = useChatSession({
    ...options,
    isPromptReady: chatPrompt.isReady,
    prompt: chatPrompt.prompt,
  });
  const menu = usePromptMenu({
    chatPrompt,
    input: chat.input,
    inputRef: chat.inputRef,
    onChoose: (choice) => {
      chat.restart();
      chatPrompt
        .choose(choice)
        .catch(() =>
          chat.showError("Echo could not remember this prompt for next time.")
        );
    },
    setInput: chat.setInput,
  });
  return { chat, chatPrompt, menu };
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
  const { chat, chatPrompt, menu } = usePromptedChat({
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
      leftFlank={<ChatPromptPill label={chatPrompt.label} menu={menu} />}
      onClose={onClose}
      panelHeightClass={panelHeightClass}
    >
      <ChatPanelContent
        bundledModel={bundledModel}
        chat={chat}
        chatPrompt={chatPrompt}
        context={context}
        contextState={contextState}
        hasConversation={hasConversation}
        isBundledModelReady={isBundledModelReady}
        menu={menu}
        onRequestAccessibility={onRequestAccessibility}
      />
    </ChatPanelShell>
  );
};

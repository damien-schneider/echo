import { Button } from "@ctrl-ui/react/ui/button";
import { CaretDownIcon, XIcon } from "@phosphor-icons/react";
import type { MotionValue } from "motion/react";
import type { ReactNode } from "react";
import {
  type BundledChatModel,
  BundledModelSetup,
  ChatReference,
} from "@/features/overlay-chat/chat-context";
import { MessageComposer } from "@/features/overlay-chat/conversation/message-composer";
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
import "@/features/overlay-chat/chat-panel.css";

interface ChatPanelProps {
  bundledModel: BundledChatModel;
  context: ChatTextContext | null;
  contextState: ChatContextEvent["state"];
  generation: number;
  hasFlanks: boolean;
  onClose: () => void;
  onRequestAccessibility: () => Promise<void>;
  voice: MotionValue<number>;
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
    className="echo-chat-control echo-chat-pill shrink-0 gap-1"
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
    className="echo-chat-control echo-chat-close shrink-0"
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
}
const ChatPanelShell = ({
  children,
  hasFlanks,
  leftFlank,
  onClose,
}: ChatPanelShellProps) => (
  <IslandHud
    bodyClassName="flex max-h-96 min-w-0 flex-1 flex-col gap-3"
    className="echo-island-chat min-h-0 min-w-0 max-w-full"
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
  menu: PromptMenu;
  onRequestAccessibility: () => Promise<void>;
  voice: MotionValue<number>;
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
  menu,
  onRequestAccessibility,
  voice,
}: ChatPanelContentProps) => (
  <>
    <ChatReference
      context={context}
      onRequestAccessibility={onRequestAccessibility}
      state={contextState}
    />
    <BundledModelSetup model={bundledModel} />
    <MessageList
      error={chat.error}
      isResponding={chat.isResponding}
      messages={chat.messages}
    />
    <PromptMenuList activeChoice={chatPrompt.activeChoice} menu={menu} />
    <MessageComposer
      canSend={
        bundledModel.status.state === "ready" && contextState !== "loading"
      }
      chat={chat}
      menu={menu}
      placeholder={composerPlaceholder(chatPrompt.prompt, context)}
      voice={voice}
    />
  </>
);
interface PromptedChatOptions {
  context: ChatTextContext | null;
  contextState: ChatContextEvent["state"];
  generation: number;
  modelState: BundledChatModel["status"]["state"];
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
  generation,
  hasFlanks,
  onClose,
  onRequestAccessibility,
  voice,
}: ChatPanelProps) => {
  const { chat, chatPrompt, menu } = usePromptedChat({
    context,
    contextState,
    generation,
    modelState: bundledModel.status.state,
  });
  return (
    <ChatPanelShell
      hasFlanks={hasFlanks}
      leftFlank={<ChatPromptPill label={chatPrompt.label} menu={menu} />}
      onClose={onClose}
    >
      <ChatPanelContent
        bundledModel={bundledModel}
        chat={chat}
        chatPrompt={chatPrompt}
        context={context}
        contextState={contextState}
        menu={menu}
        onRequestAccessibility={onRequestAccessibility}
        voice={voice}
      />
    </ChatPanelShell>
  );
};

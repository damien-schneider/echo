import type { ChatContextEvent } from "@/features/overlay-controls/runtime/overlay-windows";

export interface ChatSurfaceState {
  /// A closed chat still fills the island until the next surface is staged, and needs its conversation to draw.
  closedGeneration: number | null;
  context: ChatContextEvent | null;
}

export const initialChatSurface: ChatSurfaceState = {
  closedGeneration: null,
  context: null,
};

const nextChatContext = (
  current: ChatContextEvent | null,
  next: ChatContextEvent
): ChatContextEvent => {
  if (current === null || next.generation > current.generation) {
    return next;
  }
  if (
    next.generation < current.generation ||
    (current.state !== "loading" && next.state === "loading")
  ) {
    return current;
  }
  return next;
};

export const heardChatContext = (
  chat: ChatSurfaceState,
  next: ChatContextEvent
): ChatSurfaceState => ({
  ...chat,
  context: nextChatContext(chat.context, next),
});

export const closedChatSurface = (chat: ChatSurfaceState): ChatSurfaceState =>
  chat.context === null
    ? chat
    : { closedGeneration: chat.context.generation, context: null };

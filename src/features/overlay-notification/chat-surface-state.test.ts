import { describe, expect, it } from "bun:test";
import type { ChatContextEvent } from "@/features/overlay-controls/runtime/overlay-windows";
import {
  closedChatSurface,
  heardChatContext,
  initialChatSurface,
} from "@/features/overlay-notification/chat-surface-state";

const loading = (generation: number): ChatContextEvent => ({
  context: null,
  generation,
  state: "loading",
});

describe("chat surface state", () => {
  it("keeps the conversation of a closed chat for the panel that is still leaving", () => {
    const open = heardChatContext(initialChatSurface, loading(4));

    const closed = closedChatSurface(open);

    expect(closed.context).toBeNull();
    expect(closed.closedGeneration).toBe(4);
  });

  it("remembers the leaving conversation when the close is asked twice", () => {
    const open = heardChatContext(initialChatSurface, loading(4));

    const closedTwice = closedChatSurface(closedChatSurface(open));

    expect(closedTwice.closedGeneration).toBe(4);
  });

  it("opens the next conversation over the one that just closed", () => {
    const closed = closedChatSurface(
      heardChatContext(initialChatSurface, loading(4))
    );

    const reopened = heardChatContext(closed, loading(5));

    expect(reopened.context?.generation).toBe(5);
  });
});

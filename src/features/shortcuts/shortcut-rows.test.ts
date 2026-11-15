import { describe, expect, test } from "bun:test";
import { orderedShortcutBindings } from "@/features/shortcuts/shortcut-rows";

describe("orderedShortcutBindings", () => {
  test("renders Transcribe, Polish, then Chat", () => {
    const bindings = {
      chat: {
        current_binding: "Alt+2",
        default_binding: "Alt+2",
        description: "Open the chat",
        id: "chat",
        name: "Chat",
      },
      polish: {
        current_binding: "Alt+1",
        default_binding: "Alt+1",
        description: "Fix selected text",
        id: "polish",
        name: "Polish",
      },
      transcribe: {
        current_binding: "Alt+Space",
        default_binding: "Alt+Space",
        description: "Transcribe speech",
        id: "transcribe",
        name: "Transcribe",
      },
    };

    expect(
      orderedShortcutBindings(bindings).map((binding) => binding.id)
    ).toEqual(["transcribe", "polish", "chat"]);
  });
});

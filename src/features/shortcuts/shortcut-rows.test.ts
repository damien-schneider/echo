import { describe, expect, test } from "bun:test";
import { orderedShortcutBindings } from "@/features/shortcuts/shortcut-rows";

describe("orderedShortcutBindings", () => {
  test("renders Transcribe and Polish in a stable order", () => {
    const bindings = {
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
    ).toEqual(["transcribe", "polish"]);
  });
});

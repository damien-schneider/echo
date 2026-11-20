type ModifierState = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "metaKey" | "shiftKey"
>;

export const createShortcutKeyRecorder = (
  onRecorded: (keys: string[]) => void
) => {
  const pressed = new Set<string>();
  let recorded: string[] = [];

  return {
    press: (key: string) => {
      pressed.add(key);
      if (!recorded.includes(key)) {
        recorded = [...recorded, key];
        onRecorded(recorded);
      }
    },
    /** Resolves to the finished combo once nothing is held any more. */
    release: (key: string, modifiers?: ModifierState): string | null => {
      pressed.delete(key);
      // AppKit never sends keyup for a key pressed while Command is down
      const noModifierLeft =
        modifiers &&
        !(
          modifiers.altKey ||
          modifiers.ctrlKey ||
          modifiers.metaKey ||
          modifiers.shiftKey
        );
      if (noModifierLeft) {
        for (const held of pressed) {
          if (held !== "fn") {
            pressed.delete(held);
          }
        }
      }
      if (pressed.size > 0 || recorded.length === 0) {
        return null;
      }
      return recorded.join("+");
    },
    reset: () => {
      pressed.clear();
      recorded = [];
      onRecorded(recorded);
    },
  };
};

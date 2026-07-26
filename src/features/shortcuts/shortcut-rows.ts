import type { ShortcutBinding, ShortcutBindingsMap } from "@/lib/types";

const shortcutRank = (binding: ShortcutBinding) => {
  if (binding.id === "transcribe") {
    return 0;
  }
  if (binding.id === "polish") {
    return 1;
  }
  return 2;
};

export const orderedShortcutBindings = (bindings: ShortcutBindingsMap) =>
  Object.values(bindings).sort(
    (left, right) => shortcutRank(left) - shortcutRank(right)
  );

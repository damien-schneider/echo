import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  readShortcutFailures,
  type ShortcutFailure,
  shortcutFailureMessage,
  subscribeShortcutFailures,
} from "@/features/shortcuts/shortcut-failures";
import { listenCancellable } from "@/lib/tauri-listener";

/// A failed registration is invisible otherwise: the key just does nothing.
export const useShortcutFailureToasts = () => {
  const announced = useRef(new Set<string>());

  useEffect(() => {
    const announce = (failure: ShortcutFailure) => {
      const key = `${failure.bindingId}:${failure.binding}`;
      if (announced.current.has(key)) {
        return;
      }
      announced.current.add(key);
      toast.error(shortcutFailureMessage(failure), {
        description: "Pick another combination in Settings → Shortcuts.",
      });
    };

    return listenCancellable(async () => {
      const unlisten = await subscribeShortcutFailures(announce);
      try {
        for (const failure of await readShortcutFailures()) {
          announce(failure);
        }
      } catch (error) {
        console.warn("Shortcut failures are unavailable:", error);
      }
      return unlisten;
    });
  }, []);
};

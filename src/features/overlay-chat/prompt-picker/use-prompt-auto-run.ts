import { useEffect, useEffectEvent, useState } from "react";
import {
  type ChatPrompt,
  shouldRunPromptOnOpen,
} from "@/features/overlay-chat/chat";
import type { ChatTextContext } from "@/features/overlay-controls/runtime/overlay-windows";

interface PromptAutoRunOptions {
  canRun: boolean;
  context: ChatTextContext | null;
  isSettled: boolean;
  prompt: ChatPrompt | null;
  run: (text: string) => void;
}

/// Armed on open and on every prompt change; fires once the selection, prompt and model are known.
export const usePromptAutoRun = ({
  canRun,
  context,
  isSettled,
  prompt,
  run,
}: PromptAutoRunOptions) => {
  const [isArmed, setIsArmed] = useState(true);
  const runIfSelected = useEffectEvent(() => {
    if (canRun && context && shouldRunPromptOnOpen(prompt, context)) {
      run(context.text);
    }
  });
  useEffect(() => {
    if (!(isArmed && isSettled)) {
      return;
    }
    setIsArmed(false);
    runIfSelected();
  }, [isArmed, isSettled]);
  return { rearm: () => setIsArmed(true) };
};

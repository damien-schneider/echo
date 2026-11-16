import { useEffect, useEffectEvent } from "react";
import {
  type ChatPrompt,
  shouldRunPromptOnOpen,
} from "@/features/overlay-chat/chat";
import type { ChatTextContext } from "@/features/overlay-controls/runtime/overlay-windows";

interface PromptAutoRunOptions {
  canRun: boolean;
  context: ChatTextContext | null;
  disarm: () => void;
  isArmed: boolean;
  isSettled: boolean;
  prompt: ChatPrompt | null;
  run: () => void;
}

/// Armed on open and on every prompt change; fires once the selection, prompt and model are known.
export const usePromptAutoRun = ({
  canRun,
  context,
  disarm,
  isArmed,
  isSettled,
  prompt,
  run,
}: PromptAutoRunOptions) => {
  const runIfSelected = useEffectEvent(() => {
    disarm();
    if (canRun && shouldRunPromptOnOpen(prompt, context)) {
      run();
    }
  });
  useEffect(() => {
    if (isArmed && isSettled) {
      runIfSelected();
    }
  }, [isArmed, isSettled]);
};

import { useEffect, useState } from "react";

const CONFIRMATION_WINDOW_MS = 3000;

export const useSecondClickConfirmation = () => {
  const [isAwaitingConfirmation, setIsAwaitingConfirmation] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!isAwaitingConfirmation) {
      return;
    }
    const timer = setTimeout(
      () => setIsAwaitingConfirmation(false),
      CONFIRMATION_WINDOW_MS
    );
    return () => clearTimeout(timer);
  }, [isAwaitingConfirmation]);

  const runOnSecondClick = async (action: () => Promise<void>) => {
    if (!isAwaitingConfirmation) {
      setIsAwaitingConfirmation(true);
      return;
    }
    setIsAwaitingConfirmation(false);
    setIsRunning(true);
    try {
      await action();
    } finally {
      setIsRunning(false);
    }
  };

  return { isAwaitingConfirmation, isRunning, runOnSecondClick };
};

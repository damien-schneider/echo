import { Button } from "@ctrl-ui/react/ui/button";
import { KeyboardIcon, TrashIcon } from "@phosphor-icons/react";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useEffectEvent, useState } from "react";
import {
  clearInputEntries,
  deleteInputEntry,
  type EntriesLoad,
  loadInputEntries,
} from "@/components/settings/history/history-actions";
import { HistoryLoadError } from "@/components/settings/history/history-load-error";
import {
  type InputEntry,
  KeyboardInputEntry,
} from "@/components/settings/history/keyboard-input-entry";
import { useSecondClickConfirmation } from "@/hooks/use-second-click-confirmation";

export const KeyboardInputList = () => {
  const [inputs, setInputs] = useState<EntriesLoad<InputEntry>>({
    status: "loading",
  });
  const clearAllConfirmation = useSecondClickConfirmation();
  const loadEntries = async () => {
    setInputs(await loadInputEntries());
  };
  const retryLoad = () => {
    setInputs({ status: "loading" });
    loadEntries();
  };
  const refreshEntries = useEffectEvent(loadEntries);
  useEffect(() => {
    refreshEntries();
    const setupListener = async () => {
      const unlisten = await listen("input-entries-updated", () => {
        refreshEntries();
      });
      return unlisten;
    };
    const unlistenPromise = setupListener();
    return () => {
      unlistenPromise.then((unlisten) => {
        if (unlisten) {
          unlisten();
        }
      });
    };
  }, []);
  const handleDelete = async (id: number) => {
    if (await deleteInputEntry(id)) {
      await loadEntries();
    }
  };
  const clearAll = async () => {
    if (await clearInputEntries()) {
      await loadEntries();
    }
  };
  if (inputs.status === "loading") {
    return (
      <div className="px-4 py-3 text-center text-text/60">
        Loading keyboard inputs...
      </div>
    );
  }
  if (inputs.status === "failed") {
    return (
      <HistoryLoadError
        message={inputs.message}
        onRetry={retryLoad}
        title="Couldn't load your keyboard inputs"
      />
    );
  }
  const { entries } = inputs;
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-8 text-center text-text/60">
        <KeyboardIcon className="h-10 w-10 opacity-40" />
        <div>
          <p className="font-medium">No keyboard inputs recorded yet</p>
          <p className="mt-1 text-sm">
            Enable input tracking in Experiments settings to start recording.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-4 py-2">
        <p className="text-text/60 text-xs">
          {entries.length} recorded {entries.length === 1 ? "input" : "inputs"}
        </p>
        <Button
          disabled={clearAllConfirmation.isRunning}
          onClick={() => clearAllConfirmation.runOnSecondClick(clearAll)}
          size="sm"
          tone={
            clearAllConfirmation.isAwaitingConfirmation ? "danger" : "neutral"
          }
          variant="ghost"
        >
          <TrashIcon className="mr-1 h-3 w-3" />
          {clearAllConfirmation.isAwaitingConfirmation
            ? "Click again to confirm"
            : "Clear All"}
        </Button>
      </div>
      <div className="divide-y divide-border/10">
        {entries.map((entry) => (
          <KeyboardInputEntry
            entry={entry}
            key={entry.id}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
};

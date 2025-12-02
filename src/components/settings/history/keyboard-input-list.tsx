import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Keyboard, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { type InputEntry, KeyboardInputEntry } from "./keyboard-input-entry";

export const KeyboardInputList = () => {
  const [entries, setEntries] = useState<InputEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const loadEntries = async () => {
    try {
      const data = await invoke<InputEntry[]>("get_input_entries", {
        limit: 100,
      });
      setEntries(data);
    } catch (error) {
      console.error("Failed to load input entries:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntries();

    const setupListener = async () => {
      const unlisten = await listen("input-entries-updated", () => {
        console.log("Input entries updated, reloading...");
        loadEntries();
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
    try {
      await invoke("delete_input_entry", { id });
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (error) {
      console.error("Failed to delete input entry:", error);
      throw error;
    }
  };

  const handleClearAll = async () => {
    if (!confirmClearAll) {
      setConfirmClearAll(true);
      setTimeout(() => setConfirmClearAll(false), 3000);
      return;
    }

    try {
      await invoke("clear_all_input_entries");
      setEntries([]);
      setConfirmClearAll(false);
    } catch (error) {
      console.error("Failed to clear all entries:", error);
      setConfirmClearAll(false);
    }
  };

  if (loading) {
    return (
      <div className="px-4 py-3 text-center text-text/60">
        Loading keyboard inputs...
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-8 text-center text-text/60">
        <Keyboard className="h-10 w-10 opacity-40" />
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
          onClick={handleClearAll}
          size="sm"
          variant={confirmClearAll ? "ghostDestructive" : "ghost"}
        >
          <Trash2 className="mr-1 h-3 w-3" />
          {confirmClearAll ? "Click to confirm" : "Clear All"}
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

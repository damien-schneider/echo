import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FolderOpen, Keyboard, Mic } from "lucide-react";
import { type ComponentProps, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  type HistoryEntry,
  HistoryEntryComponent,
} from "./history-entry-component";
import { KeyboardInputList } from "./keyboard-input-list";

type HistoryTab = "transcriptions" | "keyboard";

export const HistorySettings = () => {
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<HistoryTab>("transcriptions");

  const loadHistoryEntries = useCallback(async () => {
    try {
      const entries = await invoke<HistoryEntry[]>("get_history_entries");
      setHistoryEntries(entries);
    } catch (error) {
      console.error("Failed to load history entries:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistoryEntries();

    const setupListener = async () => {
      const unlisten = await listen("history-updated", () => {
        console.log("History updated, reloading entries...");
        loadHistoryEntries();
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
  }, [loadHistoryEntries]);

  const toggleSaved = async (id: number) => {
    try {
      await invoke("toggle_history_entry_saved", { id });
    } catch (error) {
      console.error("Failed to toggle saved status:", error);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  };

  const getAudioUrl = async (fileName: string) => {
    try {
      const filePath = await invoke<string>("get_audio_file_path", {
        fileName,
      });

      return convertFileSrc(`${filePath}`, "asset");
    } catch (error) {
      console.error("Failed to get audio file path:", error);
      return null;
    }
  };

  const deleteAudioEntry = async (id: number) => {
    try {
      await invoke("delete_history_entry", { id });
    } catch (error) {
      console.error("Failed to delete audio entry:", error);
      throw error;
    }
  };

  const retranscribeEntry = async (id: number) => {
    try {
      await invoke("retranscribe_history_entry", { id });
    } catch (error) {
      console.error("Failed to retranscribe entry:", error);
      throw error;
    }
  };

  const openRecordingsFolder = async () => {
    try {
      await invoke("open_recordings_folder");
    } catch (error) {
      console.error("Failed to open recordings folder:", error);
    }
  };

  const renderTranscriptionContent = () => {
    if (loading) {
      return (
        <div className="px-4 py-3 text-center text-text/60">
          Loading history...
        </div>
      );
    }

    if (historyEntries.length === 0) {
      return (
        <div className="flex flex-col items-center gap-3 px-4 py-8 text-center text-text/60">
          <Mic className="h-10 w-10 opacity-40" />
          <div>
            <p className="font-medium">No transcriptions yet</p>
            <p className="mt-1 text-sm">
              Start recording to build your history!
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="divide-y divide-border/10">
        {historyEntries.map((entry) => (
          <HistoryEntryComponent
            deleteAudio={deleteAudioEntry}
            entry={entry}
            getAudioUrl={getAudioUrl}
            key={entry.id}
            onCopyText={() => copyToClipboard(entry.transcription_text)}
            onRetranscribe={retranscribeEntry}
            onToggleSaved={() => toggleSaved(entry.id)}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header - always visible */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">History</h2>
        <OpenRecordingsButton onClick={openRecordingsFolder} />
      </div>

      {/* Tab Toggle */}
      <div className="flex items-center justify-center">
        <div className="inline-flex rounded-lg bg-muted p-1">
          <button
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium text-sm transition-colors",
              activeTab === "transcriptions"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setActiveTab("transcriptions")}
            type="button"
          >
            <Mic className="h-4 w-4" />
            Transcriptions
          </button>
          <button
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium text-sm transition-colors",
              activeTab === "keyboard"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setActiveTab("keyboard")}
            type="button"
          >
            <Keyboard className="h-4 w-4" />
            Keyboard Inputs
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0">
        {activeTab === "transcriptions" ? (
          renderTranscriptionContent()
        ) : (
          <KeyboardInputList />
        )}
      </div>
    </div>
  );
};

const OpenRecordingsButton = ({
  onClick,
  className,
  ...props
}: ComponentProps<"button">) => (
  <Button
    className={cn("flex items-center gap-2", className)}
    onClick={onClick}
    size="sm"
    title="Open recordings folder"
    variant="secondary"
    {...props}
  >
    <FolderOpen className="h-4 w-4" />
    <span>Open Recordings Folder</span>
  </Button>
);

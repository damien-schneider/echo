import React, { useState, useEffect, ComponentProps } from "react";
import { AudioPlayer } from "../../ui/AudioPlayer";
import { Button } from "../../ui/Button";
import { Copy, Star, Check, Trash2, FolderOpen } from "lucide-react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { cn } from "@/lib/utils";

interface HistoryEntry {
  id: number;
  file_name: string;
  timestamp: number;
  saved: boolean;
  title: string;
  transcription_text: string;
}

export const HistorySettings: React.FC = () => {
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistoryEntries = async () => {
    try {
      const entries = await invoke<HistoryEntry[]>("get_history_entries");
      setHistoryEntries(entries);
    } catch (error) {
      console.error("Failed to load history entries:", error);
    } finally {
      setLoading(false);
    }
  };

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
  }, []);

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

  const openRecordingsFolder = async () => {
    try {
      await invoke("open_recordings_folder");
    } catch (error) {
      console.error("Failed to open recordings folder:", error);
    }
  };

  const renderHistoryPanel = (content: React.ReactNode) => (
    <div className="space-y-2">
      <div className="px-4 flex items-center justify-between">
        <div>
          <h2 className="text-xs font-medium text-text/60 uppercase tracking-wide">History</h2>
        </div>
        <OpenRecordingsButton onClick={openRecordingsFolder} />
      </div>
      <div className="bg-background border border-border/20 rounded-lg overflow-hidden">
        {content}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        {renderHistoryPanel(
          <div className="px-4 py-3 text-center text-text/60">Loading history...</div>,
        )}
      </div>
    );
  }

  if (historyEntries.length === 0) {
    return (
      <div className="space-y-6">
        {renderHistoryPanel(
          <div className="px-4 py-3 text-center text-text/60">
            No transcriptions yet. Start recording to build your history!
          </div>,
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {renderHistoryPanel(
        <div className="divide-y divide-border/10">
          {historyEntries.map((entry) => (
            <HistoryEntryComponent
              key={entry.id}
              entry={entry}
              onToggleSaved={() => toggleSaved(entry.id)}
              onCopyText={() => copyToClipboard(entry.transcription_text)}
              getAudioUrl={getAudioUrl}
              deleteAudio={deleteAudioEntry}
            />
          ))}
        </div>,
      )}
    </div>
  );
};

interface HistoryEntryProps {
  entry: HistoryEntry;
  onToggleSaved: () => void;
  onCopyText: () => void;
  getAudioUrl: (fileName: string) => Promise<string | null>;
  deleteAudio: (id: number) => Promise<void>;
}

const HistoryEntryComponent: React.FC<HistoryEntryProps> = ({
  entry,
  onToggleSaved,
  onCopyText,
  getAudioUrl,
  deleteAudio,
}) => {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [showCopied, setShowCopied] = useState(false);

  useEffect(() => {
    const loadAudio = async () => {
      const url = await getAudioUrl(entry.file_name);
      setAudioUrl(url);
    };
    loadAudio();
  }, [entry.file_name, getAudioUrl]);

  const handleCopyText = () => {
    onCopyText();
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 2000);
  };

  const handleDeleteEntry = async () => {
    try {
      await deleteAudio(entry.id);
    } catch (error) {
      console.error("Failed to delete entry:", error);
      alert("Failed to delete entry. Please try again.");
    }
  };

  return (
    <div className="px-4 py-4 flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <p className="text-sm font-medium">{entry.title}</p>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopyText}
            className="text-text/50 hover:text-brand  hover:border-brand transition-colors cursor-pointer"
            title="Copy transcription to clipboard"
          >
            {showCopied ? (
              <Check width={16} height={16} />
            ) : (
              <Copy width={16} height={16} />
            )}
          </button>
          <button
            onClick={onToggleSaved}
            className={`p-2 rounded  transition-colors cursor-pointer ${
              entry.saved
                ? "text-brand hover:text-brand/80"
                : "text-text/50 hover:text-brand"
            }`}
            title={entry.saved ? "Remove from saved" : "Save transcription"}
          >
            <Star
              width={16}
              height={16}
              fill={entry.saved ? "currentColor" : "none"}
            />
          </button>
          <button
            onClick={handleDeleteEntry}
            className="text-text/50 hover:text-brand transition-colors cursor-pointer"
            title="Delete entry"
          >
            <Trash2 width={16} height={16} />
          </button>
        </div>
      </div>
      <p className="italic text-text/90 text-sm pb-2">
        {entry.transcription_text}
      </p>
      {audioUrl && <AudioPlayer src={audioUrl} className="w-full" />}
    </div>
  );
};



const OpenRecordingsButton = ({ onClick, className, ...props }: ComponentProps<"button">) => (
  <Button
    onClick={onClick}
    variant="secondary"
    size="sm"
    className={cn("flex items-center gap-2", className)}
    title="Open recordings folder"
    {...props}
  >
    <FolderOpen className="w-4 h-4" />
    <span>Open Recordings Folder</span>
  </Button>
);

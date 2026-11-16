import { Button } from "@ctrl-ui/react/ui/button";
import {
  FolderOpenIcon,
  KeyboardIcon,
  MicrophoneIcon,
} from "@phosphor-icons/react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  type ComponentProps,
  useEffect,
  useEffectEvent,
  useState,
} from "react";
import {
  copyText,
  deleteHistoryEntry,
  type EntriesLoad,
  loadHistory,
  openRecordingsFolder,
  retranscribeEntry,
  tellOnFailure,
  toggleSaved,
} from "@/components/settings/history/history-actions";
import {
  type HistoryEntry,
  HistoryEntryComponent,
} from "@/components/settings/history/history-entry-component";
import { HistoryLoadError } from "@/components/settings/history/history-load-error";
import { KeyboardInputList } from "@/components/settings/history/keyboard-input-list";
import { rewriteTranscript } from "@/lib/llm/post-process";
import { cn } from "@/lib/utils";

type HistoryTab = "transcriptions" | "keyboard";

const reprocessEntry = (id: number) =>
  tellOnFailure(async () => {
    const transcription = await invoke<string>(
      "get_history_entry_transcription",
      { id }
    );
    const result = await rewriteTranscript(transcription);
    await invoke("reprocess_history_entry", {
      id,
      postProcessedText: result.kind === "text" ? result.content : null,
      postProcessPrompt: result.promptName ?? null,
    });
  }, "Couldn't reprocess the entry — try again");

export const HistorySettings = () => {
  const [history, setHistory] = useState<EntriesLoad<HistoryEntry>>({
    status: "loading",
  });
  const [activeTab, setActiveTab] = useState<HistoryTab>("transcriptions");
  const loadHistoryEntries = async () => {
    setHistory(await loadHistory());
  };
  const retryLoad = () => {
    setHistory({ status: "loading" });
    loadHistoryEntries();
  };
  const refreshHistory = useEffectEvent(loadHistoryEntries);
  useEffect(() => {
    refreshHistory();
    const setupListener = async () => {
      const unlisten = await listen("history-updated", () => {
        refreshHistory();
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
  const renderTranscriptionContent = () => {
    if (history.status === "loading") {
      return (
        <div className="px-4 py-3 text-center text-text/60">
          Loading history...
        </div>
      );
    }
    if (history.status === "failed") {
      return (
        <HistoryLoadError
          message={history.message}
          onRetry={retryLoad}
          title="Couldn't load your transcriptions"
        />
      );
    }
    if (history.entries.length === 0) {
      return (
        <div className="flex flex-col items-center gap-3 px-4 py-8 text-center text-text/60">
          <MicrophoneIcon className="h-10 w-10 opacity-40" />
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
        {history.entries.map((entry) => (
          <HistoryEntryComponent
            deleteAudio={deleteHistoryEntry}
            entry={entry}
            getAudioUrl={getAudioUrl}
            key={entry.id}
            onCopyText={() => copyText(entry.transcription_text)}
            onReprocess={reprocessEntry}
            onRetranscribe={retranscribeEntry}
            onToggleSaved={() => toggleSaved(entry.id)}
          />
        ))}
      </div>
    );
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">History</h2>
        <OpenRecordingsButton onClick={openRecordingsFolder} />
      </div>

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
            <MicrophoneIcon className="h-4 w-4" />
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
            <KeyboardIcon className="h-4 w-4" />
            Keyboard Inputs
          </button>
        </div>
      </div>

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
    variant="surface"
    {...props}
  >
    <FolderOpenIcon className="h-4 w-4" />
    <span>Open Recordings Folder</span>
  </Button>
);

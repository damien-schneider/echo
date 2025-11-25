import React, { useState, useEffect } from "react";
import { AudioPlayer } from "@/components/ui/audio-player";
import { Button } from "@/components/ui/Button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Copy, Star, Check, Trash2 } from "lucide-react";

export interface HistoryEntry {
  id: number;
  file_name: string;
  timestamp: number;
  saved: boolean;
  title: string;
  transcription_text: string;
}

export interface HistoryEntryProps {
  entry: HistoryEntry;
  onToggleSaved: () => void;
  onCopyText: () => void;
  getAudioUrl: (fileName: string) => Promise<string | null>;
  deleteAudio: (id: number) => Promise<void>;
}

export const HistoryEntryComponent: React.FC<HistoryEntryProps> = ({
  entry,
  onToggleSaved,
  onCopyText,
  getAudioUrl,
  deleteAudio,
}) => {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [showCopied, setShowCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  const handleDeleteClick = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      // Reset after 3 seconds if not confirmed
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    
    try {
      await deleteAudio(entry.id);
    } catch (error) {
      console.error("Failed to delete entry:", error);
      alert("Failed to delete entry. Please try again.");
      setConfirmDelete(false);
    }
  };

  return (
    <div className="px-4 py-4 flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <p className="text-sm font-medium">{entry.title}</p>
        <ButtonGroup>
          <Button
            onClick={handleCopyText}
            variant="secondary"
            size="icon-xs"
            title="Copy transcription to clipboard"
          >
            {showCopied ? (
              <Check width={16} height={16} />
            ) : (
              <Copy width={16} height={16} />
            )}
          </Button>
          <Button
            onClick={onToggleSaved}
            variant="secondary"
            size="icon-xs"
            title={entry.saved ? "Remove from saved" : "Save transcription"}
            className={entry.saved ? "text-brand" : ""}
          >
            <Star
              width={16}
              height={16}
              fill={entry.saved ? "currentColor" : "none"}
            />
          </Button>
          <Button
            onClick={handleDeleteClick}
            variant={confirmDelete ? "ghostDestructive" : "secondary"}
            size="icon-xs"
            title={confirmDelete ? "Click again to confirm delete" : "Delete entry"}
          >
            {confirmDelete ? (
              <Check width={16} height={16} />
            ) : (
              <Trash2 width={16} height={16} />
            )}
          </Button>
        </ButtonGroup>
      </div>
      <p className="italic text-text/90 text-sm pb-2">
        {entry.transcription_text}
      </p>
      {audioUrl && <AudioPlayer src={audioUrl} className="w-full" />}
    </div>
  );
};

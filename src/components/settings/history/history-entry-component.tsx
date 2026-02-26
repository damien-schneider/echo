import { Check, Copy, RefreshCw, RotateCcw, Star, Trash2 } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { AudioPlayer } from "@/components/ui/audio-player";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface HistoryEntry {
  file_name: string;
  id: number;
  saved: boolean;
  timestamp: number;
  title: string;
  transcription_text: string;
}

export interface HistoryEntryProps {
  deleteAudio: (id: number) => Promise<void>;
  entry: HistoryEntry;
  getAudioUrl: (fileName: string) => Promise<string | null>;
  onCopyText: () => void;
  onReprocess: (id: number) => Promise<void>;
  onRetranscribe: (id: number) => Promise<void>;
  onToggleSaved: () => void;
}

export const HistoryEntryComponent: React.FC<HistoryEntryProps> = ({
  entry,
  onToggleSaved,
  onCopyText,
  onRetranscribe,
  onReprocess,
  getAudioUrl,
  deleteAudio,
}) => {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [showCopied, setShowCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isRetranscribing, setIsRetranscribing] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);

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
      setConfirmDelete(false);
    }
  };

  const handleRetranscribe = async () => {
    if (isRetranscribing) {
      return;
    }

    setIsRetranscribing(true);
    try {
      await onRetranscribe(entry.id);
    } catch (error) {
      console.error("Failed to retranscribe entry:", error);
    } finally {
      setIsRetranscribing(false);
    }
  };

  const handleReprocess = async () => {
    if (isReprocessing) {
      return;
    }

    setIsReprocessing(true);
    try {
      await onReprocess(entry.id);
    } catch (error) {
      console.error("Failed to reprocess entry:", error);
    } finally {
      setIsReprocessing(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <div className="flex items-center justify-between">
        <p className="font-medium text-sm">{entry.title}</p>
        <TooltipProvider>
          <ButtonGroup>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  disabled={isRetranscribing}
                  onClick={handleRetranscribe}
                  size="icon-xs"
                  variant="secondary"
                >
                  <RefreshCw
                    className={isRetranscribing ? "animate-spin" : ""}
                    height={16}
                    width={16}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Retranscribe audio</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  disabled={isReprocessing}
                  onClick={handleReprocess}
                  size="icon-xs"
                  variant="secondary"
                >
                  <RotateCcw
                    className={isReprocessing ? "animate-spin" : ""}
                    height={16}
                    width={16}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reprocess with AI & TTS</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleCopyText}
                  size="icon-xs"
                  variant="secondary"
                >
                  {showCopied ? (
                    <Check height={16} width={16} />
                  ) : (
                    <Copy height={16} width={16} />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {showCopied ? "Copied!" : "Copy transcription"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className={entry.saved ? "text-brand" : ""}
                  onClick={onToggleSaved}
                  size="icon-xs"
                  variant="secondary"
                >
                  <Star
                    fill={entry.saved ? "currentColor" : "none"}
                    height={16}
                    width={16}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {entry.saved ? "Remove from saved" : "Save transcription"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleDeleteClick}
                  size="icon-xs"
                  variant={confirmDelete ? "ghostDestructive" : "secondary"}
                >
                  {confirmDelete ? (
                    <Check height={16} width={16} />
                  ) : (
                    <Trash2 height={16} width={16} />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {confirmDelete ? "Click again to confirm" : "Delete entry"}
              </TooltipContent>
            </Tooltip>
          </ButtonGroup>
        </TooltipProvider>
      </div>
      <p className="pb-2 text-sm text-text/90 italic">
        {entry.transcription_text}
      </p>
      {audioUrl && <AudioPlayer className="w-full" src={audioUrl} />}
    </div>
  );
};

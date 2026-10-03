import { Button } from "@ctrl-ui/react/ui/button";
import { ButtonGroup } from "@ctrl-ui/react/ui/button-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@ctrl-ui/react/ui/tooltip";
import { Check, Copy, RefreshCw, RotateCcw, Star, Trash2 } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { AudioPlayer } from "@/components/ui/audio-player";
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
              <TooltipTrigger
                render={
                  <Button
                    disabled={isRetranscribing}
                    iconOnly
                    onClick={handleRetranscribe}
                    size="xs"
                    variant="surface"
                  />
                }
              >
                <RefreshCw
                  className={isRetranscribing ? "animate-spin" : ""}
                  height={16}
                  width={16}
                />
              </TooltipTrigger>
              <TooltipContent>Retranscribe audio</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    disabled={isReprocessing}
                    iconOnly
                    onClick={handleReprocess}
                    size="xs"
                    variant="surface"
                  />
                }
              >
                <RotateCcw
                  className={isReprocessing ? "animate-spin" : ""}
                  height={16}
                  width={16}
                />
              </TooltipTrigger>
              <TooltipContent>Reprocess with AI & TTS</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    iconOnly
                    onClick={handleCopyText}
                    size="xs"
                    variant="surface"
                  />
                }
              >
                {showCopied ? (
                  <Check height={16} width={16} />
                ) : (
                  <Copy height={16} width={16} />
                )}
              </TooltipTrigger>
              <TooltipContent>
                {showCopied ? "Copied!" : "Copy transcription"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    className={entry.saved ? "text-brand" : ""}
                    iconOnly
                    onClick={onToggleSaved}
                    size="xs"
                    variant="surface"
                  />
                }
              >
                <Star
                  fill={entry.saved ? "currentColor" : "none"}
                  height={16}
                  width={16}
                />
              </TooltipTrigger>
              <TooltipContent>
                {entry.saved ? "Remove from saved" : "Save transcription"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    iconOnly
                    onClick={handleDeleteClick}
                    size="xs"
                    tone={confirmDelete ? "danger" : "neutral"}
                    variant={confirmDelete ? "ghost" : "surface"}
                  />
                }
              >
                {confirmDelete ? (
                  <Check height={16} width={16} />
                ) : (
                  <Trash2 height={16} width={16} />
                )}
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

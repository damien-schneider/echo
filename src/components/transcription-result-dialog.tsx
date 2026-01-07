import { listen } from "@tauri-apps/api/event";
import { CheckCircle2, X } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

interface TranscriptionResultDialogProps {
  onClose?: () => void;
}

export const TranscriptionResultDialog: React.FC<
  TranscriptionResultDialogProps
> = ({ onClose }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [transcriptionText, setTranscriptionText] = useState("");
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    const unlisten = listen<{ text: string; fileName: string }>(
      "transcription-complete",
      (event) => {
        setTranscriptionText(event.payload.text);
        setFileName(event.payload.fileName);
        setIsOpen(true);
      }
    );

    return () => {
      unlisten.then((u) => u());
    };
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    onClose?.();
  };

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(transcriptionText);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg bg-background p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <h3 className="font-semibold text-lg">Transcription Complete</h3>
          </div>
          <button
            className="text-muted-foreground transition-colors hover:text-foreground"
            onClick={handleClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {fileName && (
          <p className="mb-4 text-muted-foreground text-sm">File: {fileName}</p>
        )}

        <div className="mb-4 max-h-60 overflow-y-auto rounded-md border bg-muted/30 p-3">
          <p className="whitespace-pre-wrap text-sm">{transcriptionText}</p>
        </div>

        <div className="flex justify-end gap-2">
          <Button onClick={handleClose} variant="secondary">
            Close
          </Button>
          <Button onClick={copyToClipboard}>Copy to Clipboard</Button>
        </div>
      </div>
    </div>
  );
};

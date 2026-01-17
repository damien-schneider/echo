import { listen } from "@tauri-apps/api/event";
import { CheckCircle2 } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <DialogTitle>Transcription Complete</DialogTitle>
          </div>
          {fileName && (
            <DialogDescription>File: {fileName}</DialogDescription>
          )}
        </DialogHeader>

        <div className="max-h-60 overflow-y-auto rounded-md border bg-muted/30 p-3">
          <p className="whitespace-pre-wrap text-sm">{transcriptionText}</p>
        </div>

        <DialogFooter>
          <Button onClick={handleClose} variant="secondary">
            Close
          </Button>
          <Button onClick={copyToClipboard}>Copy to Clipboard</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

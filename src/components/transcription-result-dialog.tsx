import { Button } from "@ctrl-ui/react/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ctrl-ui/react/ui/dialog";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { listen } from "@tauri-apps/api/event";
import type React from "react";
import { useEffect, useState } from "react";

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
    const unlisten = listen<{
      text: string;
      fileName: string;
    }>("transcription-complete", (event) => {
      setTranscriptionText(event.payload.text);
      setFileName(event.payload.fileName);
      setIsOpen(true);
    });
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
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        }
      }}
      open={isOpen}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircleIcon className="h-5 w-5 text-green-500" />
            Transcription Complete
          </DialogTitle>
          {fileName && <DialogDescription>File: {fileName}</DialogDescription>}
        </DialogHeader>
        <DialogBody>
          <div className="max-h-60 overflow-y-auto rounded-md border bg-muted/30 p-3">
            <p className="whitespace-pre-wrap text-sm">{transcriptionText}</p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={handleClose} variant="surface">
            Close
          </Button>
          <Button onClick={copyToClipboard} tone="primary" variant="solid">
            Copy to Clipboard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

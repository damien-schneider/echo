import { listen } from "@tauri-apps/api/event";
import { AlertCircle } from "lucide-react";
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

interface ErrorPayload {
  title?: string;
  message: string;
  details?: string;
}

export const ErrorDialog: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [errorData, setErrorData] = useState<ErrorPayload>({
    message: "",
  });

  useEffect(() => {
    const unlisten = listen<string | ErrorPayload>(
      "show-error-dialog",
      (event) => {
        if (typeof event.payload === "string") {
          setErrorData({
            title: "Error",
            message: event.payload,
          });
        } else {
          setErrorData({
            title: event.payload.title || "Error",
            message: event.payload.message,
            details: event.payload.details,
          });
        }
        setIsOpen(true);
      }
    );

    return () => {
      unlisten.then((u) => u());
    };
  }, []);

  const handleClose = () => {
    setIsOpen(false);
  };

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            {errorData.title}
          </DialogTitle>
          <DialogDescription>{errorData.message}</DialogDescription>
        </DialogHeader>

        {errorData.details && (
          <div className="rounded-lg bg-muted p-3">
            <p className="font-mono text-muted-foreground text-xs">
              {errorData.details}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button onClick={handleClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

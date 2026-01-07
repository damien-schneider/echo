import { listen } from "@tauri-apps/api/event";
import { AlertCircle } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

export const ErrorDialog: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const unlisten = listen<string>("show-error-dialog", (event) => {
      setErrorMessage(event.payload);
      setIsOpen(true);
    });

    return () => {
      unlisten.then((u) => u());
    };
  }, []);

  const handleClose = () => {
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-lg">
        <div className="mb-4 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <h3 className="font-semibold text-lg">Error</h3>
        </div>

        <p className="mb-6 text-muted-foreground text-sm">{errorMessage}</p>

        <div className="flex justify-end">
          <Button onClick={handleClose}>Close</Button>
        </div>
      </div>
    </div>
  );
};

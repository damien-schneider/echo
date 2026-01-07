import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Upload, X } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface FileTranscriptionProgress {
  status: string;
  progress: number;
  message: string;
}

export interface FileUploadZoneProps {
  onTranscriptionComplete?: (text: string) => void;
  className?: string;
}

export const FileUploadZone: React.FC<FileUploadZoneProps> = ({
  onTranscriptionComplete,
  className,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<FileTranscriptionProgress | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const setupListener = async () => {
      const unlisten = await listen<FileTranscriptionProgress>(
        "file-transcription-progress",
        (event) => {
          setProgress(event.payload);

          if (event.payload.status === "complete") {
            setIsProcessing(false);
            setCurrentFile(null);
            // Reset progress after a delay
            setTimeout(() => {
              setProgress(null);
            }, 3000);
          }
        }
      );

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

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("dragEnter", { relatedTarget: e.relatedTarget });
    setIsDragging(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Keep dragging state true
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("dragLeave", {
      relatedTarget: e.relatedTarget,
      currentTarget: e.currentTarget,
    });
    // Only reset if we're actually leaving the container (not entering a child)
    const container = e.currentTarget;
    if (container && !container.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("dragEnd");
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("drop", { files: e.dataTransfer.files });
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);

    if (files.length === 0) {
      return;
    }

    const file = files[0];
    await processFile(file);
  }, []);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;

      if (!files || files.length === 0) {
        return;
      }

      const file = files[0];
      await processFile(file);
    },
    []
  );

  const processFile = async (file: File) => {
    setError(null);

    // Validate file type
    const validExtensions = ["wav", "wave", "mp3", "m4a", "aac", "ogg", "oga"];
    const fileExtension = file.name.split(".").pop()?.toLowerCase();

    if (!(fileExtension && validExtensions.includes(fileExtension))) {
      setError(
        `Unsupported file format: .${fileExtension}. Please upload WAV, MP3, M4A, or OGG files.`
      );
      return;
    }

    // Validate file size (max 100MB)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      setError(
        `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is 100MB.`
      );
      return;
    }

    // Validate minimum file size (10KB to avoid empty files)
    const minSize = 10 * 1024;
    if (file.size < minSize) {
      setError(
        `File too small (${(file.size / 1024).toFixed(1)}KB). Minimum size is 10KB.`
      );
      return;
    }

    setCurrentFile(file);
    setIsProcessing(true);

    try {
      // We need to save the file to a temp location for Tauri to access
      const { tempDir } = await import("@tauri-apps/api/path");
      const { open } = await import("@tauri-apps/plugin-fs");

      const tempDirPath = await tempDir();

      // Create a safe filename
      const timestamp = Date.now();
      const safeFileName = `upload-${timestamp}-${file.name}`;

      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Write to temp directory using the V2 fs API
      const tempPath = `${tempDirPath}/${safeFileName}`;
      const fileHandle = await open(tempPath, {
        write: true,
        create: true,
        truncate: true,
      });
      await fileHandle.write(uint8Array);

      // Call the transcription command
      const transcriptionText = await invoke<string>("transcribe_audio_file", {
        filePath: tempPath,
      });

      if (onTranscriptionComplete) {
        onTranscriptionComplete(transcriptionText);
      }

      // Copy to clipboard
      await navigator.clipboard.writeText(transcriptionText);

      setProgress({
        status: "complete",
        progress: 1.0,
        message: "Transcription complete! Copied to clipboard.",
      });
    } catch (err) {
      console.error("Transcription failed:", err);
      setError(
        err instanceof Error ? err.message : "Failed to transcribe file"
      );
      setIsProcessing(false);
      setCurrentFile(null);
      setProgress(null);
    }
  };

  const cancelUpload = () => {
    setCurrentFile(null);
    setIsProcessing(false);
    setProgress(null);
    setError(null);
  };

  return (
    <div className={cn("w-full", className)}>
      {!(isProcessing || currentFile || progress) && (
        <div
          className={cn(
            "relative flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-all duration-200",
            isDragging
              ? "scale-105 border-brand bg-brand/20 shadow-lg"
              : "border-border hover:border-brand hover:bg-muted/20",
            className
          )}
          onDragEnd={handleDragEnd}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
        >
          <Upload className="pointer-events-none mb-2 h-8 w-8 text-muted-foreground" />
          <p className="pointer-events-none font-medium text-sm">
            Drop audio file here or click to browse
          </p>
          <p className="pointer-events-none text-muted-foreground text-xs">
            Supports WAV, MP3, M4A, OGG (max 100MB)
          </p>
          <div className="pointer-events-none absolute inset-0">
            <input
              accept=".wav,.wave,.mp3,.m4a,.aac,.ogg,.oga,audio/wav,audio/mpeg,audio/mp4,audio/ogg"
              className="pointer-events-auto h-full w-full cursor-pointer opacity-0"
              disabled={isProcessing}
              onChange={handleFileSelect}
              type="file"
            />
          </div>
        </div>
      )}

      {currentFile && !isProcessing && (
        <div className="flex items-center justify-between rounded-lg border bg-muted/50 px-4 py-3">
          <div className="flex flex-1 flex-col">
            <p className="font-medium text-sm">{currentFile.name}</p>
            <p className="text-muted-foreground text-xs">
              {(currentFile.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
          <Button onClick={cancelUpload} size="icon-xs" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {isProcessing && progress && (
        <div className="rounded-lg border bg-muted/50 px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-medium text-sm">
              {currentFile?.name || "Processing..."}
            </p>
            <p className="text-muted-foreground text-xs">
              {Math.round(progress.progress * 100)}%
            </p>
          </div>

          <div className="mb-2 h-2 overflow-hidden rounded-full bg-border">
            <div
              className="h-full bg-brand transition-all duration-300"
              style={{ width: `${progress.progress * 100}%` }}
            />
          </div>

          <p className="text-muted-foreground text-xs">{progress.message}</p>
        </div>
      )}

      {progress && progress.status === "complete" && !isProcessing && (
        <div className="rounded-lg border border-green-500/50 bg-green-500/10 px-4 py-3">
          <p className="text-green-600 text-sm dark:text-green-400">
            ✓ {progress.message}
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
          <p className="text-destructive text-sm">{error}</p>
        </div>
      )}
    </div>
  );
};

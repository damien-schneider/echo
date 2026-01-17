import { useAtomValue, useSetAtom } from "jotai";
import {
  AlertCircle,
  Bell,
  CheckCircle,
  Clock,
  FileAudio,
  Loader2,
  MessageSquareText,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  clearCompletedTranscriptionsAtom,
  fileTranscriptionsAtom,
  removeFileTranscriptionAtom,
} from "@/lib/atoms/file-transcription-atoms";
import { cn } from "@/lib/utils";

export function FileTranscriptionCenter() {
  const [open, setOpen] = useState(false);
  const transcriptions = useAtomValue(fileTranscriptionsAtom);
  const removeTranscription = useSetAtom(removeFileTranscriptionAtom);
  const clearCompleted = useSetAtom(clearCompletedTranscriptionsAtom);

  const processingCount = transcriptions.filter(
    (t) => t.status !== "complete" && t.status !== "error"
  ).length;
  const hasItems = transcriptions.length > 0;
  const hasCompleted = transcriptions.some(
    (t) => t.status === "complete" || t.status === "error"
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "extracting":
        return <FileAudio className="h-4 w-4 animate-pulse text-orange-500" />;
      case "transcribing":
        return (
          <MessageSquareText className="h-4 w-4 animate-pulse text-blue-500" />
        );
      case "processing":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case "complete":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60_000);

    if (diffMins < 1) {
      return "Just now";
    }
    if (diffMins < 60) {
      return `${diffMins}m ago`;
    }

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }

    return date.toLocaleDateString();
  };

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          className="relative"
          size="icon-sm"
          title="File transcriptions"
          variant="ghost"
        >
          <Bell className="h-4 w-4" />
          {processingCount > 0 && (
            <span className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] text-white">
              {processingCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-0" side="top">
        <div className="flex items-center justify-between border-foreground/10 border-b px-4 py-3">
          <h3 className="font-semibold text-sm">File Transcriptions</h3>
          {hasCompleted && (
            <Button onClick={() => clearCompleted()} size="xs" variant="ghost">
              <Trash2 className="mr-1 h-3 w-3" />
              Clear completed
            </Button>
          )}
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          {!hasItems && (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
              <Bell className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-muted-foreground text-sm">
                No file transcriptions yet
              </p>
              <p className="text-muted-foreground text-xs">
                Drop audio or video files to transcribe
              </p>
            </div>
          )}

          {transcriptions.map((item) => (
            <div
              className={cn(
                "border-foreground/5 border-b px-4 py-3 transition-colors hover:bg-foreground/5",
                item.status === "error" && "bg-destructive/5"
              )}
              key={item.id}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">{getStatusIcon(item.status)}</div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-medium text-sm">
                      {item.fileName}
                    </p>
                    <Button
                      onClick={() => removeTranscription(item.id)}
                      size="icon-xs"
                      variant="ghost"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>

                  <p className="text-muted-foreground text-xs">
                    {item.message}
                  </p>

                  {(item.status === "extracting" ||
                    item.status === "transcribing" ||
                    item.status === "processing") && (
                    <div className="mt-2">
                      <div className="h-1 overflow-hidden rounded-full bg-foreground/10">
                        {item.progress < 0 ? (
                          // Indeterminate progress bar
                          <div
                            className={cn(
                              "h-full w-1/3 animate-pulse rounded-full",
                              item.status === "extracting" && "bg-orange-500",
                              item.status === "transcribing" && "bg-blue-500",
                              item.status === "processing" && "bg-blue-500"
                            )}
                            style={{
                              animation:
                                "indeterminate 1.5s ease-in-out infinite",
                            }}
                          />
                        ) : (
                          <div
                            className={cn(
                              "h-full transition-all duration-300",
                              item.status === "extracting" && "bg-orange-500",
                              item.status === "transcribing" && "bg-blue-500",
                              item.status === "processing" && "bg-blue-500"
                            )}
                            style={{ width: `${item.progress * 100}%` }}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {item.status === "error" && item.error && (
                    <div className="mt-1 rounded bg-destructive/10 px-2 py-1">
                      <p className="text-destructive text-xs">{item.error}</p>
                    </div>
                  )}

                  <p className="mt-1 text-muted-foreground/70 text-xs">
                    {formatTimestamp(item.timestamp)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

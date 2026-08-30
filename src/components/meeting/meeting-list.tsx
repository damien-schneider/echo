import { Clock, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Meeting } from "@/lib/types";
import { useMeetingStore } from "@/stores/meeting-store";

function formatDuration(ms: number | null | undefined): string {
  if (!ms) {
    return "—";
  }
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  if (h > 0) {
    return `${h}h ${m}m`;
  }
  return `${m}m`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  });
}

interface MeetingListProps {
  onSelect: (id: number) => void;
}

export const MeetingList = ({ onSelect }: MeetingListProps) => {
  const meetings = useMeetingStore((s) => s.meetings);
  const loadMeetings = useMeetingStore((s) => s.loadMeetings);
  const deleteMeeting = useMeetingStore((s) => s.deleteMeeting);

  useEffect(() => {
    loadMeetings();
  }, [loadMeetings]);

  if (meetings.length === 0) {
    return (
      <p className="py-4 text-center text-muted-foreground text-sm">
        No past meetings
      </p>
    );
  }

  return (
    <ScrollArea className="max-h-[400px]">
      <div className="flex flex-col gap-1">
        {meetings.map((meeting) => (
          <MeetingListItem
            key={meeting.id}
            meeting={meeting}
            onDelete={() => deleteMeeting(meeting.id)}
            onSelect={() => onSelect(meeting.id)}
          />
        ))}
      </div>
    </ScrollArea>
  );
};

function MeetingListItem({
  meeting,
  onSelect,
  onDelete,
}: {
  meeting: Meeting;
  onDelete: () => void;
  onSelect: () => void;
}) {
  return (
    <div className="group flex items-center justify-between rounded-md px-3 py-2 hover:bg-foreground/5">
      <button
        className="flex flex-1 flex-col gap-0.5 text-left"
        onClick={onSelect}
        type="button"
      >
        <span className="font-medium text-sm">{meeting.title}</span>
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <span>{formatDate(meeting.start_time)}</span>
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {formatDuration(meeting.duration_ms)}
          </span>
          {meeting.status === "recording" && (
            <span className="flex items-center gap-1 text-red-500">
              <span className="inline-block size-1.5 animate-pulse rounded-full bg-red-500" />
              Recording
            </span>
          )}
          {meeting.status === "processing" && (
            <span className="text-muted-foreground">Transcribing…</span>
          )}
          {meeting.status === "error" && (
            <span className="text-destructive">Interrupted</span>
          )}
          {meeting.status === "partial" && (
            <span className="text-amber-500">Partial</span>
          )}
          {meeting.status === "recorded" && (
            <span className="text-amber-500">Not transcribed</span>
          )}
        </div>
      </button>
      <Button
        className="opacity-0 group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        size="icon"
        variant="ghost"
      >
        <Trash2 className="size-3.5 text-muted-foreground" />
      </Button>
    </div>
  );
}

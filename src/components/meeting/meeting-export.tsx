import { ChevronDown, Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ExportFormat } from "@/lib/types";
import { useMeetingStore } from "@/stores/meeting-store";

const FORMATS: { label: string; value: ExportFormat }[] = [
  { label: "SRT", value: "srt" },
  { label: "VTT", value: "vtt" },
  { label: "TXT", value: "txt" },
  { label: "Markdown", value: "markdown" },
];

interface MeetingExportProps {
  meetingId: number;
  meetingTitle: string;
}

export const MeetingExport = ({
  meetingId,
  meetingTitle,
}: MeetingExportProps) => {
  const [exporting, setExporting] = useState(false);
  const exportMeeting = useMeetingStore((s) => s.exportMeeting);

  const handleExport = async (format: ExportFormat) => {
    setExporting(true);
    try {
      const content = await exportMeeting(meetingId, format);
      const ext = format === "markdown" ? "md" : format;
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${meetingTitle}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to export meeting");
    } finally {
      setExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={exporting} size="sm" variant="outline">
          <Download className="mr-1 size-3" />
          Export
          <ChevronDown className="ml-1 size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {FORMATS.map((f) => (
          <DropdownMenuItem
            key={f.value}
            onSelect={() => handleExport(f.value)}
          >
            {f.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

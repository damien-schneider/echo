import { Button } from "@ctrl-ui/react/ui/button";
import { CaretDownIcon, CaretUpIcon, SparkleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { openSummarySetup } from "@/features/meeting/open-summary-setup";
import {
  MeetingSummaryError,
  SUMMARY_SETUP_LABELS,
  type SummarySetupSection,
} from "@/lib/llm/meeting-summary";
import { errorMessage } from "@/lib/utils";
import { useMeetingStore } from "@/stores/meeting-store";

interface MeetingSummaryProps {
  meetingId: number;
  summary: string | null | undefined;
}
interface SummaryFailure {
  message: string;
  section?: SummarySetupSection;
}
const toFailure = (error: unknown): SummaryFailure => {
  if (error instanceof MeetingSummaryError) {
    return { message: error.message, section: error.section };
  }
  return { message: errorMessage(error, "Failed to generate summary") };
};
export const MeetingSummary = ({ meetingId, summary }: MeetingSummaryProps) => {
  const [expanded, setExpanded] = useState(!!summary);
  const [generating, setGenerating] = useState(false);
  const [failure, setFailure] = useState<SummaryFailure>();
  const generateSummary = useMeetingStore((s) => s.generateSummary);
  const idleLabel = summary ? "Regenerate" : "Generate summary";
  const actionLabel = generating ? "Generating..." : idleLabel;
  const failedSetupSection = failure?.section;
  const handleGenerate = async () => {
    setGenerating(true);
    setFailure(undefined);
    try {
      await generateSummary(meetingId);
    } catch (error) {
      setFailure(toFailure(error));
    } finally {
      setGenerating(false);
      setExpanded(true);
    }
  };
  return (
    <div className="rounded-panel bg-surface-group">
      <button
        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        <div className="flex items-center gap-2">
          <SparkleIcon className="size-4 text-muted-foreground" />
          <span className="font-medium text-sm">Summary</span>
        </div>
        {expanded ? (
          <CaretUpIcon className="size-4 text-muted-foreground" />
        ) : (
          <CaretDownIcon className="size-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 border-border/20 border-t px-4 py-3">
          {summary ? (
            <div className="whitespace-pre-wrap text-sm">{summary}</div>
          ) : (
            !failure && (
              <p className="pt-1 text-center text-muted-foreground text-sm">
                No summary generated yet
              </p>
            )
          )}
          {failure && (
            <div className="flex flex-col items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-center text-destructive text-xs">
              <span>{failure.message}</span>
              {failedSetupSection && (
                <Button
                  onClick={() => openSummarySetup(failedSetupSection)}
                  size="sm"
                  variant="surface"
                >
                  {SUMMARY_SETUP_LABELS[failedSetupSection]}
                </Button>
              )}
            </div>
          )}
          <Button
            className="self-center"
            disabled={generating}
            onClick={handleGenerate}
            size="sm"
            variant={summary ? "ghost" : "surface"}
          >
            <SparkleIcon className="mr-1.5 size-3.5" />
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
};

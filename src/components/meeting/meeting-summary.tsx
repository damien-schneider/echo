import { Button } from "@ctrl-ui/react/ui/button";
import { CaretDownIcon, CaretUpIcon, SparkleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import {
  OPEN_MODELS_LABEL,
  openModelsPage,
} from "@/features/meeting/open-models-page";
import { MeetingSummaryError } from "@/lib/llm/meeting-summary";
import { errorMessage } from "@/lib/utils";
import { useMeetingStore } from "@/stores/meeting-store";

interface MeetingSummaryProps {
  meetingId: number;
  summary: string | null | undefined;
}
interface SummaryFailure {
  message: string;
  needsSetup: boolean;
}
const toFailure = (error: unknown): SummaryFailure => {
  if (error instanceof MeetingSummaryError) {
    return { message: error.message, needsSetup: true };
  }
  return {
    message: errorMessage(error, "Failed to generate summary"),
    needsSetup: false,
  };
};
const SummaryFailureNotice = ({ failure }: { failure: SummaryFailure }) => (
  <div className="flex flex-col items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-center text-destructive text-xs">
    <span>{failure.message}</span>
    {failure.needsSetup && (
      <Button onClick={openModelsPage} size="sm" variant="surface">
        {OPEN_MODELS_LABEL}
      </Button>
    )}
  </div>
);
const SummaryHeader = ({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) => (
  <button
    className="flex w-full items-center justify-between px-4 py-2.5 text-left"
    onClick={onToggle}
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
);
export const MeetingSummary = ({ meetingId, summary }: MeetingSummaryProps) => {
  const [expanded, setExpanded] = useState(!!summary);
  const [generating, setGenerating] = useState(false);
  const [failure, setFailure] = useState<SummaryFailure>();
  const generateSummary = useMeetingStore((s) => s.generateSummary);
  const idleLabel = summary ? "Regenerate" : "Generate summary";
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
      <SummaryHeader
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
      />
      {expanded && (
        <div className="flex flex-col gap-3 border-border/20 border-t px-4 py-3">
          {summary && (
            <div className="whitespace-pre-wrap text-sm">{summary}</div>
          )}
          {!(summary || failure) && (
            <p className="pt-1 text-center text-muted-foreground text-sm">
              No summary generated yet
            </p>
          )}
          {failure && <SummaryFailureNotice failure={failure} />}
          <Button
            className="self-center"
            disabled={generating}
            onClick={handleGenerate}
            size="sm"
            variant={summary ? "ghost" : "surface"}
          >
            <SparkleIcon className="mr-1.5 size-3.5" />
            {generating ? "Generating..." : idleLabel}
          </Button>
        </div>
      )}
    </div>
  );
};

import { DownloadIcon } from "lucide-react";
import type React from "react";
import { Badge } from "@/components/ui/badge";
import type { ModelInfo } from "@/lib/types";
import { formatModelSize } from "@/lib/utils/format";

interface ModelCardProps {
  className?: string;
  disabled?: boolean;
  model: ModelInfo;
  onSelect: (modelId: string) => void;
  variant?: "default" | "featured";
}

const ModelCard: React.FC<ModelCardProps> = ({
  model,
  variant = "default",
  disabled = false,
  className = "",
  onSelect,
}) => {
  const isFeatured = variant === "featured";

  const baseButtonClasses =
    "flex justify-between items-center rounded-xl p-3 px-4 text-left transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand/25 active:scale-[0.98] cursor-pointer group";

  const variantClasses = isFeatured
    ? "border border-foreground/20 bg-foreground/5 hover:border-foreground/40 hover:bg-foreground/8 hover:scale-[1.02] disabled:hover:border-foreground/25 disabled:hover:bg-foreground/5 disabled:hover:scale-100"
    : "bg-foreground/5 hover:bg-foreground/10 border hover:border-foreground/10 border-foreground/0 hover:scale-[1.02] disabled:hover:border-border/20 disabled:hover:bg-transparent disabled:hover:scale-100";

  return (
    <button
      className={[baseButtonClasses, variantClasses, className]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled}
      onClick={() => onSelect(model.id)}
      type="button"
    >
      <div className="flex flex-col">
        <div className="flex items-center gap-4">
          <h3 className="font-medium text-foreground text-lg tracking-tight transition-colors group-hover:text-foreground">
            {model.name}
          </h3>
          <DownloadSize sizeMb={model.size_mb} />
          {isFeatured && <Badge variant="default">Recommended</Badge>}
        </div>
        <p className="font-light text-foreground/50 text-sm leading-relaxed">
          {model.description}
        </p>
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <p className="w-16 text-right text-text/70 text-xs">accuracy</p>
          <div className="h-2 w-20 overflow-hidden rounded-full bg-muted/20">
            <div
              className="h-full rounded-full bg-foreground transition-all duration-300"
              style={{ width: `${model.accuracy_score * 100}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <p className="w-16 text-right text-text/70 text-xs">speed</p>
          <div className="h-2 w-20 overflow-hidden rounded-full bg-muted/20">
            <div
              className="h-full rounded-full bg-foreground transition-all duration-300"
              style={{ width: `${model.speed_score * 100}%` }}
            />
          </div>
        </div>
      </div>
    </button>
  );
};

const DownloadSize = ({ sizeMb }: { sizeMb: number }) => (
  <div className="flex items-center gap-1.5 text-foreground/60 text-xs tabular-nums">
    <DownloadIcon
      aria-hidden="true"
      className="h-3.5 w-3.5 text-foreground/45"
    />
    <span className="sr-only">Download size</span>
    <span className="font-medium text-foreground/70 tracking-tight">
      {formatModelSize(sizeMb)}
    </span>
  </div>
);

export default ModelCard;

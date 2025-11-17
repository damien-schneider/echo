import React from "react";
import { DownloadIcon } from "lucide-react";
import { ModelInfo } from "../../lib/types";
import { formatModelSize } from "../../lib/utils/format";
import { Badge } from "@/components/ui/Badge";


interface ModelCardProps {
  model: ModelInfo;
  variant?: "default" | "featured";
  disabled?: boolean;
  className?: string;
  onSelect: (modelId: string) => void;
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
      onClick={() => onSelect(model.id)}
      disabled={disabled}
      className={[baseButtonClasses, variantClasses, className]
        .filter(Boolean)
        .join(" ")}
      type="button"
    >
      <div className="flex flex-col">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-medium tracking-tight text-foreground group-hover:text-foreground transition-colors">
            {model.name}
          </h3>
          <DownloadSize sizeMb={model.size_mb} />
          {isFeatured && <Badge variant="default">Recommended</Badge>}
        </div>
        <p className="text-foreground/50 font-light text-sm leading-relaxed">
          {model.description}
        </p>
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <p className="text-xs text-text/70 w-16 text-right">accuracy</p>
          <div className="w-20 h-2 bg-muted/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-foreground rounded-full transition-all duration-300"
              style={{ width: `${model.accuracy_score * 100}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xs text-text/70 w-16 text-right">speed</p>
          <div className="w-20 h-2 bg-muted/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-foreground rounded-full transition-all duration-300"
              style={{ width: `${model.speed_score * 100}%` }}
            />
          </div>
        </div>
      </div>
    </button>
  );
};

const DownloadSize = ({ sizeMb }: { sizeMb: number }) => {
  return (
    <div className="flex items-center gap-1.5 text-xs text-foreground/60 tabular-nums">
      <DownloadIcon
        aria-hidden="true"
        className="h-3.5 w-3.5 text-foreground/45"
      />
      <span className="sr-only">Download size</span>
      <span className="font-medium text-foreground/70 tracking-tight  ">
        {formatModelSize(sizeMb)}
      </span>
    </div>
  );
};

export default ModelCard;

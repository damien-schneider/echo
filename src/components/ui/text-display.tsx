import { Check, Copy } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { SettingContainer } from "./setting-container";

interface TextDisplayProps {
  copyable?: boolean;
  description: string;
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
  label: string;
  monospace?: boolean;
  onCopy?: (value: string) => void;
  placeholder?: string;
  value: string;
}

export const TextDisplay: React.FC<TextDisplayProps> = ({
  label,
  description,
  value,
  descriptionMode = "tooltip",
  grouped = false,
  placeholder = "Not available",
  copyable = false,
  monospace = false,
  onCopy,
}) => {
  const [showCopied, setShowCopied] = useState(false);

  const handleCopy = async () => {
    if (!(value && copyable)) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 1500);
      if (onCopy) {
        onCopy(value);
      }
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
  };

  const displayValue = value || placeholder;
  const textClasses = monospace ? "font-mono break-all" : "break-words";

  return (
    <SettingContainer
      description={description}
      descriptionMode={descriptionMode}
      grouped={grouped}
      layout="stacked"
      title={label}
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "flex min-h-8 items-center rounded-lg border border-border/80 bg-muted/10 px-2 py-2 text-xs",
              textClasses,
              !value && "opacity-60"
            )}
          >
            {displayValue}
          </div>
        </div>
        {copyable && value && (
          <Button
            onClick={handleCopy}
            size="icon-xs"
            title="Copy to clipboard"
            variant="ghost"
          >
            {showCopied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>
    </SettingContainer>
  );
};

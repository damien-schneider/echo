import { InfoIcon } from "lucide-react";
import type React from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";

interface SettingContainerProps {
  title: string;
  description: string;
  children: React.ReactNode;
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
  layout?: "horizontal" | "stacked";
  disabled?: boolean;
  tooltipPosition?: "top" | "bottom";
  icon?: React.ReactNode;
}

export const SettingContainer: React.FC<SettingContainerProps> = ({
  title,
  description,
  children,
  descriptionMode = "tooltip",
  grouped = false,
  layout = "horizontal",
  disabled = false,
  tooltipPosition = "top",
  icon,
}) => {
  const containerClasses = grouped
    ? "px-4 py-2"
    : "px-4 py-2 rounded-lg border border-border/20";

  if (layout === "stacked") {
    if (descriptionMode === "tooltip") {
      return (
        <div className={containerClasses}>
          <div className="mb-2 flex items-center gap-2">
            {icon && (
              <span
                className={cn(
                  "text-muted-foreground",
                  disabled && "opacity-50"
                )}
              >
                {icon}
              </span>
            )}
            <h3 className={cn("font-medium text-sm", disabled && "opacity-50")}>
              {title}
            </h3>
            <TooltipProvider>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <InfoIcon className="size-4 cursor-help text-muted-foreground transition-colors duration-200 hover:text-brand" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs" side={tooltipPosition}>
                  {description}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="w-full">{children}</div>
        </div>
      );
    }

    return (
      <div className={containerClasses}>
        <div className="mb-2">
          <div className="flex items-center gap-2">
            {icon && (
              <span
                className={cn(
                  "text-muted-foreground",
                  disabled && "opacity-50"
                )}
              >
                {icon}
              </span>
            )}
            <h3 className={cn("font-medium text-sm", disabled && "opacity-50")}>
              {title}
            </h3>
          </div>
          <p className={cn("text-sm", disabled && "opacity-50")}>
            {description}
          </p>
        </div>
        <div className="w-full">{children}</div>
      </div>
    );
  }

  // Horizontal layout (default)
  const horizontalContainerClasses = grouped
    ? "flex items-center justify-between py-2 px-4"
    : "flex items-center justify-between py-2 px-4 rounded-lg border border-border/20";

  if (descriptionMode === "tooltip") {
    return (
      <div className={cn("min-h-12", horizontalContainerClasses)}>
        <div className="max-w-2/3">
          <div className="flex items-center gap-2">
            {icon && (
              <span
                className={cn(
                  "text-muted-foreground",
                  disabled && "opacity-50"
                )}
              >
                {icon}
              </span>
            )}
            <h3 className={cn("text-sm", disabled && "opacity-50")}>{title}</h3>
            <TooltipProvider>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <InfoIcon className="size-4 cursor-help text-muted-foreground transition-colors duration-200 hover:text-brand" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs" side={tooltipPosition}>
                  {description}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        <div className="relative">{children}</div>
      </div>
    );
  }

  return (
    <div className={horizontalContainerClasses}>
      <div className="max-w-2/3">
        <div className="flex items-center gap-2">
          {icon && (
            <span
              className={cn("text-muted-foreground", disabled && "opacity-50")}
            >
              {icon}
            </span>
          )}
          <h3 className={cn("font-medium text-sm", disabled && "opacity-50")}>
            {title}
          </h3>
        </div>
        <p className={cn("text-sm", disabled && "opacity-50")}>{description}</p>
      </div>
      <div className="relative">{children}</div>
    </div>
  );
};

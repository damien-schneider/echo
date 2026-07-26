import {
  Group,
  type GroupProps,
  Panel,
  type PanelProps,
  Separator,
  type SeparatorProps,
} from "react-resizable-panels";
import { cn } from "@/lib/utils";

function ResizablePanelGroup({ className, ...props }: GroupProps) {
  return (
    <Group
      className={cn("h-full w-full", className)}
      data-slot="resizable-panel-group"
      {...props}
    />
  );
}

function ResizablePanel({ ...props }: PanelProps) {
  return <Panel data-slot="resizable-panel" {...props} />;
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: SeparatorProps & {
  withHandle?: boolean;
}) {
  return (
    <Separator
      className={cn(
        "group/handle relative flex items-center justify-center bg-transparent outline-hidden",
        "w-3 cursor-col-resize data-[panel-group-direction=vertical]:h-3 data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:cursor-row-resize",
        "[&[data-panel-group-direction=vertical]:hover>div]:scale-x-125 [&[data-panel-group-direction=vertical]:hover>div]:scale-y-100 [&[data-panel-group-direction=vertical]>div]:h-0.5 [&[data-panel-group-direction=vertical]>div]:w-8",
        className
      )}
      data-slot="resizable-handle"
      {...props}
    >
      {withHandle && (
        <div className="z-10 h-8 w-0.5 shrink-0 rounded-full bg-border transition-all duration-150 group-hover/handle:scale-y-125 group-hover/handle:bg-foreground/50" />
      )}
    </Separator>
  );
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };

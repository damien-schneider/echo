import { Slot } from "@radix-ui/react-slot";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cva, type VariantProps } from "class-variance-authority";
import { Minus, Square, X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

const TITLEBAR_HEIGHT = "2rem";

const windowControlVariants = cva(
  "inline-flex cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/20 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        close:
          "text-muted-foreground hover:bg-destructive hover:text-destructive-foreground",
      },
      size: {
        default: "size-6 [&_svg]:size-3",
        sm: "size-5 [&_svg]:size-2.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

interface WindowControlButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof windowControlVariants> {
  asChild?: boolean;
}

const WindowControlButton = React.forwardRef<
  HTMLButtonElement,
  WindowControlButtonProps
>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(windowControlVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  );
});
WindowControlButton.displayName = "WindowControlButton";

export interface TitleBarProps extends React.HTMLAttributes<HTMLDivElement> {}

const TitleBar = React.forwardRef<HTMLDivElement, TitleBarProps>(
  ({ className, ...props }, ref) => {
    const handleMinimize = async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      console.log("Minimize clicked");
      await getCurrentWindow().minimize();
    };

    const handleMaximize = async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      console.log("Maximize clicked");
      await getCurrentWindow().toggleMaximize();
    };

    const handleClose = async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      console.log("Close clicked");
      await getCurrentWindow().close();
    };

    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-end gap-1 bg-sidebar px-2",
          className
        )}
        data-tauri-drag-region
        ref={ref}
        style={
          {
            "--titlebar-height": TITLEBAR_HEIGHT,
            height: "var(--titlebar-height)",
            borderTopLeftRadius: "var(--window-radius)",
            borderTopRightRadius: "var(--window-radius)",
          } as React.CSSProperties
        }
        {...props}
      >
        <WindowControlButton onClick={handleMinimize} type="button">
          <Minus />
          <span className="sr-only">Minimize</span>
        </WindowControlButton>
        <WindowControlButton onClick={handleMaximize} type="button">
          <Square />
          <span className="sr-only">Maximize</span>
        </WindowControlButton>
        <WindowControlButton
          onClick={handleClose}
          type="button"
          variant="close"
        >
          <X />
          <span className="sr-only">Close</span>
        </WindowControlButton>
      </div>
    );
  }
);
TitleBar.displayName = "TitleBar";

export { TitleBar, WindowControlButton, windowControlVariants };

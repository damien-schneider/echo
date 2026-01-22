import { Slot } from "@radix-ui/react-slot";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cva, type VariantProps } from "class-variance-authority";
import { Minus, Square, X } from "lucide-react";
import type {
  ComponentPropsWithoutRef,
  CSSProperties,
  MouseEvent,
} from "react";
import { getNormalizedOsPlatform } from "@/lib/os";
import { cn } from "@/lib/utils";

const TITLEBAR_HEIGHT = "2rem";

// Cache platform at module level to avoid repeated calls
const platform = getNormalizedOsPlatform();
const isMacOS = platform === "mac";
const isWindows = platform === "windows";

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
  extends VariantProps<typeof windowControlVariants> {
  asChild?: boolean;
}

const WindowControlButton = ({
  className,
  variant,
  size,
  asChild = false,
  ref,
  ...props
}: ComponentPropsWithoutRef<"button"> &
  WindowControlButtonProps & { ref?: React.Ref<HTMLButtonElement> }) => {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(windowControlVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  );
};
WindowControlButton.displayName = "WindowControlButton";

const TitleBar = ({
  className,
  ref,
  ...props
}: ComponentPropsWithoutRef<"div"> & {
  ref?: React.Ref<HTMLDivElement>;
}) => {
  // On macOS, use native traffic light controls - don't render custom title bar
  if (isMacOS) {
    return (
      <div
        className={cn("h-8 shrink-0 bg-transparent!", className)}
        data-tauri-drag-region
        ref={ref}
        style={{
          borderTopLeftRadius: "var(--window-radius)",
          borderTopRightRadius: "var(--window-radius)",
        }}
        {...props}
      />
    );
  }

  const handleMinimize = async (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await getCurrentWindow().minimize();
    } catch (error) {
      console.error("Failed to minimize window", error);
    }
  };

  const handleMaximize = async (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await getCurrentWindow().toggleMaximize();
    } catch (error) {
      console.error("Failed to toggle maximize window", error);
    }
  };

  const handleClose = async (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await getCurrentWindow().close();
    } catch (error) {
      console.error("Failed to close window", error);
    }
  };

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-end gap-1 px-2",
        className
      )}
      data-tauri-drag-region
      ref={ref}
      style={
        {
          "--titlebar-height": TITLEBAR_HEIGHT,
          height: "var(--titlebar-height)",
          ...(isWindows
            ? {}
            : {
                borderTopLeftRadius: "var(--window-radius)",
                borderTopRightRadius: "var(--window-radius)",
              }),
        } as CSSProperties
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
      <WindowControlButton onClick={handleClose} type="button" variant="close">
        <X />
        <span className="sr-only">Close</span>
      </WindowControlButton>
    </div>
  );
};
TitleBar.displayName = "TitleBar";

export { TitleBar, WindowControlButton, windowControlVariants };

"use client";

import { ScrollArea as ScrollAreaPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useHasTouchPrimary } from "@/hooks/use-has-touch-primary";
import { cn } from "@/lib/utils";

const ScrollAreaContext = createContext<boolean>(false);
type MaskState = {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
};

const ScrollArea = ({
  className,
  children,
  scrollHideDelay = 0,
  viewportClassName,
  ref,
  disableMaskingSide = [],
  ...props
}: ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  viewportClassName?: string;
  disableMaskingSide?: Array<"top" | "bottom" | "left" | "right">;
}) => {
  const [maskState, setMaskState] = useState<MaskState>({
    top: false,
    bottom: false,
    left: false,
    right: false,
  });
  const viewportRef = useRef<HTMLDivElement>(null);
  const isTouch = useHasTouchPrimary();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const element = viewportRef.current;
    if (!element) {
      return;
    }

    const checkScrollability = () => {
      const {
        scrollTop,
        scrollLeft,
        scrollWidth,
        clientWidth,
        scrollHeight,
        clientHeight,
      } = element;
      setMaskState({
        top: scrollTop > 0,
        bottom: scrollTop + clientHeight < scrollHeight - 1,
        left: scrollLeft > 0,
        right: scrollLeft + clientWidth < scrollWidth - 1,
      });
    };

    const controller = new AbortController();
    const { signal } = controller;

    const resizeObserver = new ResizeObserver(checkScrollability);
    resizeObserver.observe(element);

    element.addEventListener("scroll", checkScrollability, { signal });
    window.addEventListener("resize", checkScrollability, { signal });

    // Run an initial check whenever dependencies change (including pointer mode)
    checkScrollability();

    return () => {
      controller.abort();
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <ScrollAreaContext.Provider value={isTouch}>
      {isTouch ? (
        // biome-ignore lint/a11y/useSemanticElements: <>
        <div
          aria-roledescription="scroll area"
          className={cn("relative overflow-hidden", className)}
          data-slot="scroll-area"
          ref={ref}
          role="group"
          {...props}
        >
          <div
            className={cn(
              "size-full overflow-auto rounded-[inherit]",
              maskState.top &&
                !disableMaskingSide.includes("top") &&
                "mask-t-from-[calc(100%-2rem)]",
              maskState.bottom &&
                !disableMaskingSide.includes("bottom") &&
                "mask-b-from-[calc(100%-2rem)]",
              maskState.left &&
                !disableMaskingSide.includes("left") &&
                "mask-l-from-[calc(100%-2rem)]",
              maskState.right &&
                !disableMaskingSide.includes("right") &&
                "mask-r-from-[calc(100%-2rem)]",
              viewportClassName
            )}
            data-slot="scroll-area-viewport"
            ref={viewportRef}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: <>
            tabIndex={0}
          >
            {children}
          </div>
        </div>
      ) : (
        <ScrollAreaPrimitive.Root
          className={cn("relative overflow-hidden", className)}
          data-slot="scroll-area"
          ref={ref}
          scrollHideDelay={scrollHideDelay}
          {...props}
        >
          <ScrollAreaPrimitive.Viewport
            className={cn(
              "size-full rounded-[inherit]",
              maskState.top &&
                !disableMaskingSide.includes("top") &&
                "mask-t-from-[calc(100%-2rem)]",
              maskState.bottom &&
                !disableMaskingSide.includes("bottom") &&
                "mask-b-from-[calc(100%-2rem)]",
              maskState.left &&
                !disableMaskingSide.includes("left") &&
                "mask-l-from-[calc(100%-2rem)]",
              maskState.right &&
                !disableMaskingSide.includes("right") &&
                "mask-r-from-[calc(100%-2rem)]",
              viewportClassName
            )}
            data-slot="scroll-area-viewport"
            ref={viewportRef}
          >
            {children}
          </ScrollAreaPrimitive.Viewport>
          <ScrollBar />
          <ScrollAreaPrimitive.Corner />
        </ScrollAreaPrimitive.Root>
      )}
    </ScrollAreaContext.Provider>
  );
};

ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = ({
  className,
  orientation = "vertical",
  ref,
  ...props
}: ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) => {
  const isTouch = useContext(ScrollAreaContext);

  if (isTouch) {
    return null;
  }

  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      className={cn(
        "data-[state=visible]:fade-in-0 data-[state=hidden]:fade-out-0 flex touch-none select-none p-px transition-[colors] duration-150 hover:bg-foreground/5 data-[state=hidden]:animate-out data-[state=visible]:animate-in",
        orientation === "vertical" &&
          "h-full w-2.5 border-l border-l-transparent py-4",
        orientation === "horizontal" &&
          "h-2.5 flex-col border-t border-t-transparent px-1 pr-1.25",
        className
      )}
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      ref={ref}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        className={cn(
          "relative z-9999 flex-1 origin-center rounded-full bg-foreground/10 transition-[scale]",
          orientation === "vertical" && "my-1 active:scale-y-95",
          orientation === "horizontal" && "active:scale-x-98"
        )}
        data-slot="scroll-area-thumb"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
};

ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };

import type { HTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/lib/utils";

export interface GlassWindowProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

const GlassWindow = ({
  className,
  children,
  ref,
  ...props
}: GlassWindowProps & { ref?: Ref<HTMLDivElement> }) => (
  <div
    className={cn("relative flex h-screen flex-col bg-background", className)}
    ref={ref}
    {...props}
  >
    {children}
  </div>
);
GlassWindow.displayName = "GlassWindow";

export { GlassWindow };

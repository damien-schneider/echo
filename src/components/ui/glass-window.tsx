import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const GlassWindow = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    className={cn("relative flex h-screen flex-col bg-background", className)}
    {...props}
  />
);

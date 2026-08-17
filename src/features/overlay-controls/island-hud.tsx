import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type IslandHudLayout = "activity" | "chat";

interface IslandHudProps {
  bodyClassName?: string;
  children: ReactNode;
  className?: string;
  hasFlanks: boolean;
  layout: IslandHudLayout;
  leftFlank: ReactNode;
  rightFlank: ReactNode;
}

interface IslandHudFlankProps {
  children: ReactNode;
  side: "left" | "right";
}

const IslandHudFlank = ({ children, side }: IslandHudFlankProps) => {
  if (children === null || children === undefined) {
    return null;
  }
  return (
    <div className="echo-island-hud-flank" data-side={side}>
      {children}
    </div>
  );
};

export const IslandHud = ({
  bodyClassName,
  children,
  className,
  hasFlanks,
  layout,
  leftFlank,
  rightFlank,
}: IslandHudProps) => (
  <div
    className={cn("echo-island-hud", className)}
    data-component="island-hud"
    data-flanked={hasFlanks}
    data-layout={layout}
  >
    <IslandHudFlank side="left">{leftFlank}</IslandHudFlank>
    <IslandHudFlank side="right">{rightFlank}</IslandHudFlank>
    <div
      className={cn("echo-island-hud-body", bodyClassName)}
      data-component="island-hud-body"
    >
      {children}
    </div>
  </div>
);

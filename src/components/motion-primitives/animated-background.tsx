"use client";
import { AnimatePresence, type MotionProps, motion } from "motion/react";
import {
  Children,
  cloneElement,
  type HTMLAttributes,
  type ReactElement,
  useEffect,
  useId,
  useState,
} from "react";
import { cn } from "@/lib/utils";

interface AnimatedChildProps extends HTMLAttributes<HTMLElement> {
  "data-id": string;
  "data-checked"?: string;
}

export interface AnimatedBackgroundProps {
  children:
    | ReactElement<AnimatedChildProps>[]
    | ReactElement<AnimatedChildProps>;
  defaultValue?: string;
  onValueChange?: (newActiveId: string | null) => void;
  className?: string;
  transition?: MotionProps["transition"];
  enableHover?: boolean;
}

export function AnimatedBackground({
  children,
  defaultValue,
  onValueChange,
  className,
  transition,
  enableHover = false,
}: AnimatedBackgroundProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const uniqueId = useId();

  const handleSetActiveId = (id: string | null) => {
    setActiveId(id);

    if (onValueChange) {
      onValueChange(id);
    }
  };

  useEffect(() => {
    if (defaultValue !== undefined) {
      setActiveId(defaultValue);
    }
  }, [defaultValue]);

  return Children.map(children, (child) => {
    const id = child.props["data-id"];

    const interactionProps = enableHover
      ? {
          onMouseEnter: () => handleSetActiveId(id),
          onMouseLeave: () => handleSetActiveId(defaultValue ?? null),
        }
      : {
          onClick: () => handleSetActiveId(id),
        };

    return cloneElement(
      child,
      {
        key: id,
        className: cn("relative inline-flex", child.props.className),
        "data-checked": activeId === id ? "true" : "false",
        ...interactionProps,
      },
      <>
        <AnimatePresence initial={false}>
          {activeId === id && (
            <motion.div
              animate={{
                opacity: 1,
              }}
              className={cn("absolute inset-0", className)}
              exit={{
                opacity: 0,
              }}
              initial={{ opacity: defaultValue ? 1 : 0 }}
              layoutId={`background-${uniqueId}`}
              transition={transition}
            />
          )}
        </AnimatePresence>
        <div className="z-10">{child.props.children}</div>
      </>
    );
  });
}

import { motion } from "motion/react";
import { useRef } from "react";
import { cn } from "@/lib/utils";
import { SettingContainer } from "./setting-container";

interface SliderProps {
  description?: string;
  descriptionMode?: "inline" | "tooltip";
  disabled?: boolean;
  formatValue?: (value: number) => string;
  grouped?: boolean;
  icon?: React.ReactNode;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  showValue?: boolean;
  step?: number;
  value: number;
}

const spring = {
  type: "spring",
  stiffness: 400,
  damping: 30,
} as const;

export const Slider: React.FC<SliderProps> = ({
  value,
  onChange,
  min,
  max,
  step = 0.01,
  disabled = false,
  label,
  description,
  descriptionMode = "tooltip",
  grouped = false,
  showValue = true,
  formatValue = (v) => v.toFixed(2),
  icon,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);

  const percentage = ((value - min) / (max - min)) * 100;

  const handleInteraction = (clientX: number) => {
    if (disabled || !trackRef.current) {
      return;
    }
    const rect = trackRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const newPercentage = Math.max(0, Math.min(1, x / rect.width));
    const newValue = min + newPercentage * (max - min);
    const steppedValue = Math.round(newValue / step) * step;
    onChange(Math.max(min, Math.min(max, steppedValue)));
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) {
      return;
    }
    e.preventDefault();
    handleInteraction(e.clientX);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      handleInteraction(moveEvent.clientX);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) {
      return;
    }
    const largeStep = (max - min) / 10;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(Math.min(max, value + step));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(Math.max(min, value - step));
    } else if (e.key === "Home") {
      e.preventDefault();
      onChange(min);
    } else if (e.key === "End") {
      e.preventDefault();
      onChange(max);
    } else if (e.key === "PageUp") {
      e.preventDefault();
      onChange(Math.min(max, value + largeStep));
    } else if (e.key === "PageDown") {
      e.preventDefault();
      onChange(Math.max(min, value - largeStep));
    }
  };

  const sliderElement = (
    <div
      aria-label={label}
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={value}
      className={cn(
        "group relative flex h-8 min-w-[180px] items-center justify-between overflow-hidden rounded-lg bg-muted",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      )}
      onKeyDown={handleKeyDown}
      onMouseDown={handleMouseDown}
      ref={trackRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
    >
      {/* Fill area from left to thumb */}
      <motion.div
        animate={{ width: `calc(8px + ${percentage}% * (100% - 16px) / 100%)` }}
        className="pointer-events-none absolute inset-y-0 left-0 bg-foreground/6"
        transition={spring}
      />

      {/* Thumb indicator */}
      <motion.div
        animate={{
          left: `calc(8px + ${percentage}% * (100% - 16px) / 100% - 2px)`,
        }}
        className="pointer-events-none absolute top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-foreground/50 transition-[height,background-color,transform] duration-200 ease-out group-hover:h-[22px] group-hover:scale-x-105 group-hover:bg-foreground/70 group-active:h-6 group-active:scale-x-110 group-active:bg-foreground/90"
        transition={spring}
      />

      {/* Label on the left */}
      <span className="pointer-events-none relative z-10 select-none px-3 font-medium text-foreground/45 text-xs tracking-tight">
        {label}
      </span>

      {/* Value on the right */}
      {showValue && (
        <span className="pointer-events-none relative z-10 select-none px-3 text-foreground/50 text-sm tabular-nums">
          {formatValue(value)}
        </span>
      )}
    </div>
  );

  if (description) {
    return (
      <SettingContainer
        description={description}
        descriptionMode={descriptionMode}
        disabled={disabled}
        grouped={grouped}
        icon={icon}
        layout="horizontal"
        title={label}
      >
        {sliderElement}
      </SettingContainer>
    );
  }

  return sliderElement;
};

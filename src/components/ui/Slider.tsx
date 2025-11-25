import { useRef } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { SettingContainer } from "./SettingContainer";

interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  label: string;
  description?: string;
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
  showValue?: boolean;
  formatValue?: (value: number) => string;
  icon?: React.ReactNode;
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
    if (disabled || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const newPercentage = Math.max(0, Math.min(1, x / rect.width));
    const newValue = min + newPercentage * (max - min);
    const steppedValue = Math.round(newValue / step) * step;
    onChange(Math.max(min, Math.min(max, steppedValue)));
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
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

  const sliderElement = (
    <div
      ref={trackRef}
      onMouseDown={handleMouseDown}
      className={cn(
        "group relative flex items-center justify-between h-8 min-w-[180px] rounded-lg bg-muted overflow-hidden",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      )}
    >
      {/* Fill area from left to thumb */}
      <motion.div
        className="absolute inset-y-0 left-0 bg-foreground/6 pointer-events-none"
        animate={{ width: `calc(8px + ${percentage}% * (100% - 16px) / 100%)` }}
        transition={spring}
      />

      {/* Thumb indicator */}
      <motion.div
        className="absolute top-1/2 -translate-y-1/2 w-1 h-5 rounded-full pointer-events-none bg-foreground/50 group-hover:h-[22px] group-hover:bg-foreground/70 group-hover:scale-x-105 group-active:h-6 group-active:bg-foreground/90 group-active:scale-x-110 transition-[height,background-color,transform] duration-200 ease-out"
        animate={{ left: `calc(8px + ${percentage}% * (100% - 16px) / 100% - 2px)` }}
        transition={spring}
      />

      {/* Label on the left */}
      <span className="relative z-10 px-3 text-xs font-medium text-foreground/45 tracking-tight pointer-events-none select-none">
        {label}
      </span>

      {/* Value on the right */}
      {showValue && (
        <span className="relative z-10 px-3 text-sm text-foreground/50 tabular-nums pointer-events-none select-none">
          {formatValue(value)}
        </span>
      )}
    </div>
  );

  if (description) {
    return (
      <SettingContainer
        title={label}
        description={description}
        descriptionMode={descriptionMode}
        grouped={grouped}
        layout="horizontal"
        disabled={disabled}
        icon={icon}
      >
        {sliderElement}
      </SettingContainer>
    );
  }

  return sliderElement;
};

import { Pause, Play } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const drawBarShape = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  if (radius > 0) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, width, height);
  }
};

const resolveWaveformColors = (
  canvas: HTMLCanvasElement,
  activeColor: string | undefined,
  inactiveColor: string | undefined
) => ({
  active:
    activeColor ||
    getComputedStyle(canvas).getPropertyValue("--color-primary").trim() ||
    "#FAA2CA",
  inactive:
    inactiveColor ||
    getComputedStyle(canvas).getPropertyValue("--foreground") ||
    "rgba(128, 128, 128, 0.3)",
});

const drawPartialBar = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fillRatio: number,
  activeColor: string,
  inactiveColor: string
) => {
  ctx.fillStyle = inactiveColor;
  ctx.globalAlpha = 0.4;
  drawBarShape(ctx, x, y, width, height, radius);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width * fillRatio, height);
  ctx.clip();
  ctx.fillStyle = activeColor;
  ctx.globalAlpha = 1;
  drawBarShape(ctx, x, y, width, height, radius);
  ctx.restore();
};

interface AudioPlayerProps {
  src: string;
  className?: string;
  barWidth?: number;
  barGap?: number;
  barRadius?: number;
  barCount?: number;
  height?: number;
  activeColor?: string;
  inactiveColor?: string;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  src,
  className = "",
  barWidth = 3,
  barGap = 2,
  barRadius = 2,
  barCount = 50,
  height = 32,
  activeColor,
  inactiveColor,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [, setThemeVersion] = useState(0); // Used to force re-render on theme change

  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const dragTimeRef = useRef<number>(0);

  // Use refs to avoid stale closures in animation loop
  const isPlayingRef = useRef(false);
  const isDraggingRef = useRef(false);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);

  // Generate consistent waveform data based on the src
  const waveformData = useMemo(() => {
    const seed = src
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const random = (i: number) => {
      const x = Math.sin(seed + i * 137.5) * 10_000;
      return x - Math.floor(x);
    };
    return Array.from({ length: barCount }, (_, i) => 0.15 + random(i) * 0.7);
  }, [src, barCount]);

  // Keep refs in sync with state
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  // Canvas resize handler
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!(canvas && container)) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // Render waveform
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Already extracted helpers, remaining complexity is inherent to waveform rendering
  const renderWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    const progress =
      durationRef.current > 0
        ? currentTimeRef.current / durationRef.current
        : 0;
    const colors = resolveWaveformColors(canvas, activeColor, inactiveColor);

    const step = barWidth + barGap;
    const totalWidth = barCount * step - barGap;
    const startX = (rect.width - totalWidth) / 2;
    const centerY = rect.height / 2;

    for (let i = 0; i < barCount; i++) {
      const value = waveformData[i];
      const barHeight = Math.max(4, value * rect.height * 0.85);
      const x = startX + i * step;
      const y = centerY - barHeight / 2;

      const barProgress = (i + 1) / barCount;
      const previousBarProgress = i / barCount;
      const isPartiallyFilled =
        previousBarProgress < progress && barProgress > progress;

      if (isPartiallyFilled) {
        const fillRatio =
          (progress - previousBarProgress) /
          (barProgress - previousBarProgress);
        drawPartialBar(
          ctx,
          x,
          y,
          barWidth,
          barHeight,
          barRadius,
          fillRatio,
          colors.active,
          colors.inactive
        );
      } else {
        const isFilled = barProgress <= progress;
        ctx.fillStyle = isFilled ? colors.active : colors.inactive;
        ctx.globalAlpha = isFilled ? 1 : 0.4;
        drawBarShape(ctx, x, y, barWidth, barHeight, barRadius);
      }
    }

    ctx.globalAlpha = 1;
  }, [
    activeColor,
    inactiveColor,
    barWidth,
    barGap,
    barCount,
    barRadius,
    waveformData,
  ]);

  // Watch for theme changes to re-render with new colors
  useEffect(() => {
    const observer = new MutationObserver(() => {
      // Trigger re-render when theme changes
      setThemeVersion((v) => v + 1);
      // Also immediately re-render the waveform
      renderWaveform();
    });

    // Watch for class/attribute changes on html and body elements
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });

    return () => observer.disconnect();
  }, [
    // Also immediately re-render the waveform
    renderWaveform,
  ]);

  // Animation loop for playback
  useEffect(() => {
    const tick = () => {
      if (audioRef.current && !isDraggingRef.current) {
        const time = audioRef.current.currentTime;
        setCurrentTime(time);
        currentTimeRef.current = time;
      }

      renderWaveform();

      if (isPlayingRef.current) {
        animationRef.current = requestAnimationFrame(tick);
      }
    };

    if (isPlaying && !isDragging) {
      if (!animationRef.current) {
        animationRef.current = requestAnimationFrame(tick);
      }
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = undefined;
      }
      // Still render when not playing to show current state
      renderWaveform();
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = undefined;
      }
    };
  }, [
    isPlaying,
    isDragging, // Still render when not playing to show current state
    renderWaveform,
  ]);

  // Re-render when currentTime changes (for scrubbing)
  useEffect(() => {
    if (!isPlaying) {
      renderWaveform();
    }
  }, [isPlaying, renderWaveform]);

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
      durationRef.current = audio.duration || 0;
      setCurrentTime(0);
      currentTimeRef.current = 0;
      renderWaveform();
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(audio.duration || 0);
      currentTimeRef.current = audio.duration || 0;
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
    };
  }, [renderWaveform]);

  // Calculate time from click position
  const getTimeFromPosition = useCallback(
    (clientX: number) => {
      const container = containerRef.current;
      if (!container) {
        return 0;
      }

      const rect = container.getBoundingClientRect();
      const step = barWidth + barGap;
      const totalWidth = barCount * step - barGap;
      const startX = (rect.width - totalWidth) / 2;

      const x = clientX - rect.left;
      const relativeX = x - startX;
      const progress = Math.max(0, Math.min(1, relativeX / totalWidth));

      return progress * duration;
    },
    [barWidth, barGap, barCount, duration]
  );

  // Mouse/touch handlers for scrubbing
  const handlePointerDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);

    const newTime = getTimeFromPosition(e.clientX);
    dragTimeRef.current = newTime;
    setCurrentTime(newTime);
    currentTimeRef.current = newTime;
  };

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handlePointerMove = (e: MouseEvent) => {
      const newTime = getTimeFromPosition(e.clientX);
      dragTimeRef.current = newTime;
      setCurrentTime(newTime);
      currentTimeRef.current = newTime;
      renderWaveform();
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      if (audioRef.current) {
        audioRef.current.currentTime = dragTimeRef.current;
      }
    };

    document.addEventListener("mousemove", handlePointerMove);
    document.addEventListener("mouseup", handlePointerUp);
    document.addEventListener("touchmove", (e) =>
      handlePointerMove(e.touches[0] as unknown as MouseEvent)
    );
    document.addEventListener("touchend", handlePointerUp);

    return () => {
      document.removeEventListener("mousemove", handlePointerMove);
      document.removeEventListener("mouseup", handlePointerUp);
      document.removeEventListener("touchmove", (e) =>
        handlePointerMove(e.touches[0] as unknown as MouseEvent)
      );
      document.removeEventListener("touchend", handlePointerUp);
    };
  }, [isDragging, getTimeFromPosition, renderWaveform]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    try {
      if (isPlaying) {
        audio.pause();
      } else {
        await audio.play();
      }
    } catch (error) {
      console.error("Playback failed:", error);
    }
  };

  const formatTime = (time: number): string => {
    if (!Number.isFinite(time)) {
      return "0:00";
    }

    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <audio preload="metadata" ref={audioRef} src={src}>
        <track kind="captions" />
      </audio>

      <button
        aria-label={isPlaying ? "Pause" : "Play"}
        className="shrink-0 cursor-pointer text-text transition-colors hover:text-brand"
        onClick={togglePlay}
        type="button"
      >
        {isPlaying ? (
          <Pause fill="currentColor" height={20} width={20} />
        ) : (
          <Play fill="currentColor" height={20} width={20} />
        )}
      </button>

      <div className="flex flex-1 items-center gap-2">
        <span className="min-w-[30px] text-text/60 text-xs tabular-nums">
          {formatTime(currentTime)}
        </span>

        <div
          aria-label="Audio progress"
          aria-valuemax={duration}
          aria-valuemin={0}
          aria-valuenow={currentTime}
          className="flex-1 cursor-pointer select-none"
          onMouseDown={handlePointerDown}
          ref={containerRef}
          role="slider"
          style={{ height: `${height}px` }}
          tabIndex={0}
        >
          <canvas className="block h-full w-full" ref={canvasRef} />
        </div>

        <span className="min-w-[30px] text-text/60 text-xs tabular-nums">
          {formatTime(duration)}
        </span>
      </div>
    </div>
  );
};

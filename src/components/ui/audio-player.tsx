import { PauseIcon, PlayIcon } from "@phosphor-icons/react";
import {
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import {
  drawWaveform,
  timeAtClientX,
  waveformBars,
} from "@/components/ui/waveform";
import { cn } from "@/lib/utils";

const formatTime = (time: number): string => {
  if (!Number.isFinite(time)) {
    return "0:00";
  }

  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

interface AudioPlayerProps {
  className?: string;
  src: string;
}

export const AudioPlayer = ({ className, src }: AudioPlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const dragTimeRef = useRef(0);

  // refs, not state — the animation loop would close over stale values
  const isPlayingRef = useRef(false);
  const isDraggingRef = useRef(false);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);

  const bars = waveformBars(src);

  const renderWaveform = useEffectEvent(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const progress =
      durationRef.current > 0
        ? currentTimeRef.current / durationRef.current
        : 0;
    drawWaveform(canvas, bars, progress);
  });

  const showTime = (time: number) => {
    setCurrentTime(time);
    currentTimeRef.current = time;
  };

  const scrubTo = (clientX: number) => {
    const container = containerRef.current;
    const time = container
      ? timeAtClientX(container, clientX, durationRef.current)
      : 0;
    dragTimeRef.current = time;
    showTime(time);
  };

  const onFrame = useEffectEvent(() => {
    if (audioRef.current && !isDraggingRef.current) {
      showTime(audioRef.current.currentTime);
    }
    renderWaveform();
  });

  const onLoadedMetadata = useEffectEvent((audioDuration: number) => {
    setDuration(audioDuration);
    durationRef.current = audioDuration;
    showTime(0);
    renderWaveform();
  });

  const onEnded = useEffectEvent((audioDuration: number) => {
    setIsPlaying(false);
    showTime(audioDuration);
  });

  const onDragMove = useEffectEvent((clientX: number) => {
    scrubTo(clientX);
    renderWaveform();
  });

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

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

      canvas.getContext("2d")?.scale(dpr, dpr);
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(() => renderWaveform());
    const themeAttributes = {
      attributeFilter: ["class", "data-theme", "style"],
      attributes: true,
    };
    observer.observe(document.documentElement, themeAttributes);
    observer.observe(document.body, themeAttributes);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const tick = () => {
      onFrame();
      if (isPlayingRef.current) {
        animationRef.current = requestAnimationFrame(tick);
      }
    };

    const stopAnimation = () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = undefined;
      }
    };

    if (isPlaying && !isDragging) {
      animationRef.current ??= requestAnimationFrame(tick);
    } else {
      stopAnimation();
      renderWaveform();
    }

    return stopAnimation;
  }, [isPlaying, isDragging]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const handleLoadedMetadata = () => onLoadedMetadata(audio.duration || 0);
    const handleEnded = () => onEnded(audio.duration || 0);

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
  }, []);

  const handlePointerDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    scrubTo(e.clientX);
  };

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => onDragMove(e.clientX);

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) {
        onDragMove(touch.clientX);
      }
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      if (audioRef.current) {
        audioRef.current.currentTime = dragTimeRef.current;
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handlePointerUp);
    document.addEventListener("touchmove", handleTouchMove);
    document.addEventListener("touchend", handlePointerUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handlePointerUp);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handlePointerUp);
    };
  }, [isDragging]);

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
          <PauseIcon height={20} weight="fill" width={20} />
        ) : (
          <PlayIcon height={20} weight="fill" width={20} />
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
          className="h-8 flex-1 cursor-pointer select-none"
          onMouseDown={handlePointerDown}
          ref={containerRef}
          role="slider"
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

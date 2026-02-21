import { type HTMLAttributes, useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

const computeStaticProcessingBar = (
  i: number,
  halfCount: number,
  time: number,
  transitionProgress: number,
  lastActiveData: number[]
): number => {
  const normalizedPosition = (i - halfCount) / halfCount;
  const centerWeight = 1 - Math.abs(normalizedPosition) * 0.4;
  const wave1 = Math.sin(time * 1.5 + normalizedPosition * 3) * 0.25;
  const wave2 = Math.sin(time * 0.8 - normalizedPosition * 2) * 0.2;
  const wave3 = Math.cos(time * 2 + normalizedPosition) * 0.15;
  const processingValue = (0.2 + wave1 + wave2 + wave3) * centerWeight;

  let finalValue = processingValue;
  if (lastActiveData.length > 0 && transitionProgress < 1) {
    const lastValue =
      lastActiveData[Math.min(i, lastActiveData.length - 1)] || 0;
    finalValue =
      lastValue * (1 - transitionProgress) +
      processingValue * transitionProgress;
  }
  return Math.max(0.05, Math.min(1, finalValue));
};

const computeRollingProcessingBar = (
  i: number,
  barCount: number,
  time: number,
  transitionProgress: number,
  lastActiveData: number[]
): number => {
  const normalizedPosition = (i - barCount / 2) / (barCount / 2);
  const centerWeight = 1 - Math.abs(normalizedPosition) * 0.4;
  const wave1 = Math.sin(time * 1.5 + i * 0.15) * 0.25;
  const wave2 = Math.sin(time * 0.8 - i * 0.1) * 0.2;
  const wave3 = Math.cos(time * 2 + i * 0.05) * 0.15;
  const processingValue = (0.2 + wave1 + wave2 + wave3) * centerWeight;

  let finalValue = processingValue;
  if (lastActiveData.length > 0 && transitionProgress < 1) {
    const lastValue =
      lastActiveData[Math.floor((i / barCount) * lastActiveData.length)] || 0;
    finalValue =
      lastValue * (1 - transitionProgress) +
      processingValue * transitionProgress;
  }
  return Math.max(0.05, Math.min(1, finalValue));
};

const drawWfBar = (
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

export type LiveWaveformProps = HTMLAttributes<HTMLDivElement> & {
  active?: boolean;
  processing?: boolean;
  deviceId?: string;
  barWidth?: number;
  barGap?: number;
  barRadius?: number;
  barColor?: string;
  fadeEdges?: boolean;
  fadeWidth?: number;
  height?: string | number;
  sensitivity?: number;
  smoothingTimeConstant?: number;
  fftSize?: number;
  historySize?: number;
  updateRate?: number;
  mode?: "scrolling" | "static";
  onError?: (error: Error) => void;
  onStreamReady?: (stream: MediaStream) => void;
  onStreamEnd?: () => void;
  audioLevels?: number[];
  disableInternalAudio?: boolean;
};

export const LiveWaveform = ({
  active = false,
  processing = false,
  deviceId,
  barWidth = 3,
  barGap = 1,
  barRadius = 1.5,
  barColor,
  fadeEdges = true,
  fadeWidth = 24,
  height = 64,
  sensitivity = 1,
  smoothingTimeConstant = 0.8,
  fftSize = 256,
  historySize = 60,
  updateRate = 30,
  mode = "static",
  onError,
  onStreamReady,
  onStreamEnd,
  audioLevels = [],
  disableInternalAudio = false,
  className,
  ...props
}: LiveWaveformProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<number[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number>(0);
  const lastUpdateRef = useRef<number>(0);
  const processingAnimationRef = useRef<number | null>(null);
  const lastActiveDataRef = useRef<number[]>([]);
  const transitionProgressRef = useRef(0);
  const staticBarsRef = useRef<number[]>([]);
  const needsRedrawRef = useRef(true);
  const gradientCacheRef = useRef<CanvasGradient | null>(null);
  const lastWidthRef = useRef(0);
  const audioLevelsRef = useRef(audioLevels);
  const targetBarsRef = useRef<number[]>([]);

  useEffect(() => {
    audioLevelsRef.current = audioLevels;
  }, [audioLevels]);

  const heightStyle = typeof height === "number" ? `${height}px` : height;

  // Handle canvas resizing
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
        // Pre-warm the 2D context by forcing eager allocation
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      gradientCacheRef.current = null;
      lastWidthRef.current = rect.width;
      needsRedrawRef.current = true;
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (processing && !active) {
      let time = 0;
      transitionProgressRef.current = 0;

      const animateProcessing = () => {
        time += 0.03;
        transitionProgressRef.current = Math.min(
          1,
          transitionProgressRef.current + 0.02
        );

        const processingData: number[] = [];
        const barCount = Math.floor(
          (containerRef.current?.getBoundingClientRect().width || 200) /
            (barWidth + barGap)
        );

        if (mode === "static") {
          const halfCount = Math.floor(barCount / 2);
          for (let i = 0; i < barCount; i++) {
            processingData.push(
              computeStaticProcessingBar(
                i,
                halfCount,
                time,
                transitionProgressRef.current,
                lastActiveDataRef.current
              )
            );
          }
        } else {
          for (let i = 0; i < barCount; i++) {
            processingData.push(
              computeRollingProcessingBar(
                i,
                barCount,
                time,
                transitionProgressRef.current,
                lastActiveDataRef.current
              )
            );
          }
        }

        if (mode === "static") {
          staticBarsRef.current = processingData;
        } else {
          historyRef.current = processingData;
        }

        needsRedrawRef.current = true;
        processingAnimationRef.current =
          requestAnimationFrame(animateProcessing);
      };

      animateProcessing();

      return () => {
        if (processingAnimationRef.current) {
          cancelAnimationFrame(processingAnimationRef.current);
        }
      };
    }
    if (!(active || processing)) {
      const hasData =
        mode === "static"
          ? staticBarsRef.current.length > 0
          : historyRef.current.length > 0;

      if (hasData) {
        let fadeProgress = 0;
        const fadeToIdle = () => {
          fadeProgress += 0.03;
          if (fadeProgress < 1) {
            if (mode === "static") {
              staticBarsRef.current = staticBarsRef.current.map(
                (value) => value * (1 - fadeProgress)
              );
            } else {
              historyRef.current = historyRef.current.map(
                (value) => value * (1 - fadeProgress)
              );
            }
            needsRedrawRef.current = true;
            requestAnimationFrame(fadeToIdle);
          } else if (mode === "static") {
            staticBarsRef.current = [];
          } else {
            historyRef.current = [];
          }
        };
        fadeToIdle();
      }
    }
  }, [processing, active, barWidth, barGap, mode]);

  // Handle microphone setup and teardown
  useEffect(() => {
    if (!active) {
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
        onStreamEnd?.();
      }
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== "closed"
      ) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = 0;
      }
      return;
    }

    if (disableInternalAudio) {
      return;
    }

    const setupMicrophone = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: deviceId
            ? {
                deviceId: { exact: deviceId },
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              }
            : {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
        });
        streamRef.current = stream;
        onStreamReady?.(stream);

        const AudioContextConstructor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const audioContext = new AudioContextConstructor();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = fftSize;
        analyser.smoothingTimeConstant = smoothingTimeConstant;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        audioContextRef.current = audioContext;
        analyserRef.current = analyser;

        // Clear history when starting
        historyRef.current = [];
      } catch (error) {
        onError?.(error as Error);
      }
    };

    setupMicrophone();

    return () => {
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
        onStreamEnd?.();
      }
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== "closed"
      ) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = 0;
      }
    };
  }, [
    active,
    deviceId,
    fftSize,
    smoothingTimeConstant,
    onError,
    onStreamReady,
    onStreamEnd,
    disableInternalAudio,
  ]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    let rafId: number;

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Canvas animation loop with dual rendering modes requires inline branching
    const animate = (currentTime: number) => {
      // Render waveform
      const rect = canvas.getBoundingClientRect();

      // Pre-initialize bars with placeholders when active starts
      if (active && staticBarsRef.current.length === 0 && mode === "static") {
        const barCount = Math.floor(rect.width / (barWidth + barGap));
        staticBarsRef.current = new Array(barCount).fill(0.05);
        needsRedrawRef.current = true;
      }

      // Update audio data if active
      if (active && currentTime - lastUpdateRef.current > updateRate) {
        lastUpdateRef.current = currentTime;

        if (mode === "static") {
          const barCount = Math.floor(rect.width / (barWidth + barGap));
          const halfCount = Math.floor(barCount / 2);
          const sourceData = audioLevelsRef.current;
          const newTargetBars: number[] = [];

          // Mirror the data for symmetric display
          for (let i = halfCount - 1; i >= 0; i--) {
            const normalizedIndex = (i / halfCount) * (sourceData.length - 1);
            const indexFloor = Math.floor(normalizedIndex);
            const indexCeil = Math.ceil(normalizedIndex);
            const fraction = normalizedIndex - indexFloor;

            const valueFloor = sourceData[indexFloor] || 0;
            const valueCeil = sourceData[indexCeil] || 0;
            const value =
              (valueFloor * (1 - fraction) + valueCeil * fraction) *
              sensitivity;

            newTargetBars.push(Math.max(0.02, Math.min(1, value)));
          }

          for (let i = 0; i < halfCount; i++) {
            const normalizedIndex = (i / halfCount) * (sourceData.length - 1);
            const indexFloor = Math.floor(normalizedIndex);
            const indexCeil = Math.ceil(normalizedIndex);
            const fraction = normalizedIndex - indexFloor;

            const valueFloor = sourceData[indexFloor] || 0;
            const valueCeil = sourceData[indexCeil] || 0;
            const value =
              (valueFloor * (1 - fraction) + valueCeil * fraction) *
              sensitivity;

            newTargetBars.push(Math.max(0.02, Math.min(1, value)));
          }

          targetBarsRef.current = newTargetBars;

          // Initialize if size changed
          if (staticBarsRef.current.length !== newTargetBars.length) {
            staticBarsRef.current = new Array(newTargetBars.length).fill(0.02);
          }

          // Direct assignment since backend handles smoothing
          staticBarsRef.current = newTargetBars;
          lastActiveDataRef.current = staticBarsRef.current;
        } else {
          // Scrolling mode - use average of current levels
          const sourceData = audioLevelsRef.current;
          let sum = 0;
          for (const level of sourceData) {
            sum += level;
          }
          const average =
            sourceData.length > 0 ? (sum / sourceData.length) * sensitivity : 0;

          // Add to history
          historyRef.current.push(Math.min(1, Math.max(0.05, average)));
          lastActiveDataRef.current = [...historyRef.current];

          // Maintain history size
          if (historyRef.current.length > historySize) {
            historyRef.current.shift();
          }
        }
        needsRedrawRef.current = true;
      }

      // Only redraw if needed
      if (!(needsRedrawRef.current || active)) {
        rafId = requestAnimationFrame(animate);
        return;
      }

      needsRedrawRef.current = active;
      ctx.clearRect(0, 0, rect.width, rect.height);

      const computedBarColor =
        barColor ||
        (() => {
          const style = getComputedStyle(canvas);
          // Try to get the computed color value directly
          const color = style.color;
          return color || "#000";
        })();

      const step = barWidth + barGap;
      const barCount = Math.floor(rect.width / step);
      const centerY = rect.height / 2;

      // Draw bars based on mode
      if (mode === "static") {
        // Static mode - bars in fixed positions
        const dataToRender =
          processing || active || staticBarsRef.current.length > 0
            ? staticBarsRef.current
            : [];

        for (let i = 0; i < barCount && i < dataToRender.length; i++) {
          const value = dataToRender[i] || 0.1;
          const x = i * step;
          const barHeight = Math.max(4, value * rect.height * 0.8);
          const y = centerY - barHeight / 2;

          ctx.fillStyle = computedBarColor;
          ctx.globalAlpha = 0.4 + value * 0.6;
          drawWfBar(ctx, x, y, barWidth, barHeight, barRadius);
        }
      } else {
        // Scrolling mode - original behavior
        for (let i = 0; i < barCount && i < historyRef.current.length; i++) {
          const dataIndex = historyRef.current.length - 1 - i;
          const value = historyRef.current[dataIndex] || 0.1;
          const x = rect.width - (i + 1) * step;
          const barHeight = Math.max(4, value * rect.height * 0.8);
          const y = centerY - barHeight / 2;

          ctx.fillStyle = computedBarColor;
          ctx.globalAlpha = 0.4 + value * 0.6;
          drawWfBar(ctx, x, y, barWidth, barHeight, barRadius);
        }
      }

      // Apply edge fading
      if (fadeEdges && fadeWidth > 0 && rect.width > 0) {
        // Cache gradient if width hasn't changed
        if (!gradientCacheRef.current || lastWidthRef.current !== rect.width) {
          const gradient = ctx.createLinearGradient(0, 0, rect.width, 0);
          const fadePercent = Math.min(0.3, fadeWidth / rect.width);

          // destination-out: removes destination where source alpha is high
          // We want: fade edges out, keep center solid
          // Left edge: start opaque (1) = remove, fade to transparent (0) = keep
          gradient.addColorStop(0, "rgba(255,255,255,1)");
          gradient.addColorStop(fadePercent, "rgba(255,255,255,0)");
          // Center stays transparent = keep everything
          gradient.addColorStop(1 - fadePercent, "rgba(255,255,255,0)");
          // Right edge: fade from transparent (0) = keep to opaque (1) = remove
          gradient.addColorStop(1, "rgba(255,255,255,1)");

          gradientCacheRef.current = gradient;
          lastWidthRef.current = rect.width;
        }

        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = gradientCacheRef.current;
        ctx.fillRect(0, 0, rect.width, rect.height);
        ctx.globalCompositeOperation = "source-over";
      }

      ctx.globalAlpha = 1;

      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [
    active,
    processing,
    sensitivity,
    updateRate,
    historySize,
    barWidth,
    barGap,
    barRadius,
    barColor,
    fadeEdges,
    fadeWidth,
    mode,
  ]);

  let waveformAriaLabel: string;
  if (active) {
    waveformAriaLabel = "Live audio waveform";
  } else if (processing) {
    waveformAriaLabel = "Processing audio";
  } else {
    waveformAriaLabel = "Audio waveform idle";
  }

  return (
    <div
      aria-label={waveformAriaLabel}
      className={cn("relative h-full w-full", className)}
      ref={containerRef}
      role="img"
      style={{ height: heightStyle }}
      {...props}
    >
      {!(active || processing) && (
        <div className="absolute top-1/2 right-0 left-0 -translate-y-1/2 border-muted-foreground/20 border-t-2 border-dotted" />
      )}
      <canvas className="block h-full w-full" ref={canvasRef} />
    </div>
  );
};

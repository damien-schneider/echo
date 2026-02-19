import { cn } from "@/lib/utils";

export interface CpuArchitectureSvgProps {
  className?: string;
  width?: string;
  height?: string;
  showCpuConnections?: boolean;
  lineMarkerSize?: number;
  animateText?: boolean;
  animateLines?: boolean;
  animateMarkers?: boolean;
}

const Architecture = ({
  className,
  width = "100%",
  height = "100%",
  showCpuConnections = true,
  animateText = true,
  lineMarkerSize = 18,
  animateLines = true,
}: CpuArchitectureSvgProps) => {
  return (
    <svg
      aria-label="CPU architecture diagram"
      className={cn("text-muted", className)}
      height={height}
      role="img"
      viewBox="0 0 200 100"
      width={width}
    >
      {/* Paths */}
      <g
        fill="none"
        markerStart="url(#cpu-circle-marker)"
        pathLength="100"
        stroke="currentColor"
        strokeDasharray="100 100"
        strokeWidth="0.3"
      >
        {/* 1st */}
        <path
          d="M 10 20 h 79.5 q 5 0 5 5 v 30"
          pathLength="100"
          strokeDasharray="100 100"
        />
        {/* 2nd */}
        <path
          d="M 180 10 h -69.7 q -5 0 -5 5 v 30"
          pathLength="100"
          strokeDasharray="100 100"
        />
        {/* 3rd */}
        <path d="M 130 20 v 21.8 q 0 5 -5 5 h -10" />
        {/* 4th */}
        <path d="M 170 80 v -21.8 q 0 -5 -5 -5 h -50" />
        {/* 5th */}
        <path
          d="M 135 65 h 15 q 5 0 5 5 v 10 q 0 5 -5 5 h -39.8 q -5 0 -5 -5 v -20"
          pathLength="100"
          strokeDasharray="100 100"
        />
        {/* 6th */}
        <path d="M 94.8 95 v -36" />
        {/* 7th */}
        <path d="M 88 88 v -15 q 0 -5 -5 -5 h -10 q -5 0 -5 -5 v -5 q 0 -5 5 -5 h 14" />
        {/* 8th */}
        <path d="M 30 30 h 25 q 5 0 5 5 v 6.5 q 0 5 5 5 h 20" />
        {/* Animation For Path Starting */}
        {animateLines && (
          <animate
            attributeName="stroke-dashoffset"
            calcMode="spline"
            dur="1s"
            fill="freeze"
            from="100"
            keySplines="0.25,0.1,0.5,1"
            keyTimes="0; 1"
            to="0"
          />
        )}
      </g>

      {/* 1. Blue Light */}
      <g mask="url(#cpu-mask-1)">
        <circle
          className="cpu-architecture cpu-line-1"
          cx="0"
          cy="0"
          fill="url(#cpu-blue-grad)"
          r="8"
        />
      </g>
      {/* 2. Yellow Light */}
      <g mask="url(#cpu-mask-2)">
        <circle
          className="cpu-architecture cpu-line-2"
          cx="0"
          cy="0"
          fill="url(#cpu-yellow-grad)"
          r="8"
        />
      </g>
      {/* 3. Pinkish Light */}
      <g mask="url(#cpu-mask-3)">
        <circle
          className="cpu-architecture cpu-line-3"
          cx="0"
          cy="0"
          fill="url(#cpu-pinkish-grad)"
          r="8"
        />
      </g>
      {/* 4. White Light */}
      <g mask="url(#cpu-mask-4)">
        <circle
          className="cpu-architecture cpu-line-4"
          cx="0"
          cy="0"
          fill="url(#cpu-white-grad)"
          r="8"
        />
      </g>
      {/* 5. Green Light */}
      <g mask="url(#cpu-mask-5)">
        <circle
          className="cpu-architecture cpu-line-5"
          cx="0"
          cy="0"
          fill="url(#cpu-green-grad)"
          r="8"
        />
      </g>
      {/* 6. Orange Light */}
      <g mask="url(#cpu-mask-6)">
        <circle
          className="cpu-architecture cpu-line-6"
          cx="0"
          cy="0"
          fill="url(#cpu-orange-grad)"
          r="8"
        />
      </g>
      {/* 7. Cyan Light */}
      <g mask="url(#cpu-mask-7)">
        <circle
          className="cpu-architecture cpu-line-7"
          cx="0"
          cy="0"
          fill="url(#cpu-cyan-grad)"
          r="8"
        />
      </g>
      {/* 8. Rose Light */}
      <g mask="url(#cpu-mask-8)">
        <circle
          className="cpu-architecture cpu-line-8"
          cx="0"
          cy="0"
          fill="url(#cpu-rose-grad)"
          r="8"
        />
      </g>
      {/* CPU Box */}
      <g>
        {/* Cpu connections */}
        {showCpuConnections && (
          <>
            <path
              d="M 85 43 h -3"
              stroke="url(#cpu-connection-gradient)"
              strokeWidth="0.5"
            />
            <path
              d="M 85 46 h -3"
              stroke="url(#cpu-connection-gradient)"
              strokeWidth="0.5"
            />
            <path
              d="M 85 49 h -3"
              stroke="url(#cpu-connection-gradient)"
              strokeWidth="0.5"
            />
            <path
              d="M 85 52 h -3"
              stroke="url(#cpu-connection-gradient)"
              strokeWidth="0.5"
            />
            <path
              d="M 85 55 h -3"
              stroke="url(#cpu-connection-gradient)"
              strokeWidth="0.5"
            />
            <path
              d="M 85 58 h -3"
              stroke="url(#cpu-connection-gradient)"
              strokeWidth="0.5"
            />
            <path
              d="M 115 43 h 3"
              stroke="url(#cpu-connection-gradient)"
              strokeWidth="0.5"
            />
            <path
              d="M 115 46 h 3"
              stroke="url(#cpu-connection-gradient)"
              strokeWidth="0.5"
            />
            <path
              d="M 115 49 h 3"
              stroke="url(#cpu-connection-gradient)"
              strokeWidth="0.5"
            />
            <path
              d="M 115 52 h 3"
              stroke="url(#cpu-connection-gradient)"
              strokeWidth="0.5"
            />
            <path
              d="M 115 55 h 3"
              stroke="url(#cpu-connection-gradient)"
              strokeWidth="0.5"
            />
            <path
              d="M 115 58 h 3"
              stroke="url(#cpu-connection-gradient)"
              strokeWidth="0.5"
            />
            <path
              d="M 92 60 v 3"
              stroke="url(#cpu-connection-gradient)"
              strokeWidth="0.5"
            />
            <path
              d="M 95 60 v 3"
              stroke="url(#cpu-connection-gradient)"
              strokeWidth="0.5"
            />
            <path
              d="M 98 60 v 3"
              stroke="url(#cpu-connection-gradient)"
              strokeWidth="0.5"
            />
            <path
              d="M 101 60 v 3"
              stroke="url(#cpu-connection-gradient)"
              strokeWidth="0.5"
            />
            <path
              d="M 104 60 v 3"
              stroke="url(#cpu-connection-gradient)"
              strokeWidth="0.5"
            />
            <path
              d="M 107 60 v 3"
              stroke="url(#cpu-connection-gradient)"
              strokeWidth="0.5"
            />
            <path
              d="M 92 40 v -3"
              stroke="url(#cpu-connection-gradient)"
              strokeWidth="0.5"
            />
            <path
              d="M 95 40 v -3"
              stroke="url(#cpu-connection-gradient)"
              strokeWidth="0.5"
            />
            <path
              d="M 98 40 v -3"
              stroke="url(#cpu-connection-gradient)"
              strokeWidth="0.5"
            />
            <path
              d="M 101 40 v -3"
              stroke="url(#cpu-connection-gradient)"
              strokeWidth="0.5"
            />
            <path
              d="M 104 40 v -3"
              stroke="url(#cpu-connection-gradient)"
              strokeWidth="0.5"
            />
            <path
              d="M 107 40 v -3"
              stroke="url(#cpu-connection-gradient)"
              strokeWidth="0.5"
            />
          </>
        )}
        <rect
          fill="#181818"
          filter="url(#cpu-light-shadow)"
          height="20"
          rx="2"
          width="30"
          x="85"
          y="40"
        />
        <rect
          fill={animateText ? "url(#cpu-text-gradient)" : "white"}
          height="15"
          rx="1"
          width="15"
          x="92.5"
          y="42.5"
        />
      </g>
      {/* Masks */}
      <defs>
        <mask id="cpu-mask-1">
          <path
            d="M 10 20 h 79.5 q 5 0 5 5 v 24"
            stroke="white"
            strokeWidth="0.5"
          />
        </mask>
        <mask id="cpu-mask-2">
          <path
            d="M 180 10 h -69.7 q -5 0 -5 5 v 24"
            stroke="white"
            strokeWidth="0.5"
          />
        </mask>
        <mask id="cpu-mask-3">
          <path
            d="M 130 20 v 21.8 q 0 5 -5 5 h -10"
            stroke="white"
            strokeWidth="0.5"
          />
        </mask>
        <mask id="cpu-mask-4">
          <path
            d="M 170 80 v -21.8 q 0 -5 -5 -5 h -50"
            stroke="white"
            strokeWidth="0.5"
          />
        </mask>
        <mask id="cpu-mask-5">
          <path
            d="M 135 65 h 15 q 5 0 5 5 v 10 q 0 5 -5 5 h -39.8 q -5 0 -5 -5 v -20"
            stroke="white"
            strokeWidth="0.5"
          />
        </mask>
        <mask id="cpu-mask-6">
          <path d="M 94.8 95 v -36" stroke="white" strokeWidth="0.5" />
        </mask>
        <mask id="cpu-mask-7">
          <path
            d="M 88 88 v -15 q 0 -5 -5 -5 h -10 q -5 0 -5 -5 v -5 q 0 -5 5 -5 h 14"
            stroke="white"
            strokeWidth="0.5"
          />
        </mask>
        <mask id="cpu-mask-8">
          <path
            d="M 30 30 h 25 q 5 0 5 5 v 6.5 q 0 5 5 5 h 20"
            stroke="white"
            strokeWidth="0.5"
          />
        </mask>
        <radialGradient fx="1" id="cpu-blue-grad">
          <stop offset="0%" stopColor="#00E8ED" />
          <stop offset="50%" stopColor="#08F" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient fx="1" id="cpu-yellow-grad">
          <stop offset="0%" stopColor="#FFD800" />
          <stop offset="50%" stopColor="#FFD800" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient fx="1" id="cpu-pinkish-grad">
          <stop offset="0%" stopColor="#830CD1" />
          <stop offset="50%" stopColor="#FF008B" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient fx="1" id="cpu-white-grad">
          <stop offset="0%" stopColor="white" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient fx="1" id="cpu-green-grad">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient fx="1" id="cpu-orange-grad">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient fx="1" id="cpu-cyan-grad">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient fx="1" id="cpu-rose-grad">
          <stop offset="0%" stopColor="#f43f5e" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <filter
          height="200%"
          id="cpu-light-shadow"
          width="200%"
          x="-50%"
          y="-50%"
        >
          <feDropShadow
            dx="1.5"
            dy="1.5"
            floodColor="black"
            floodOpacity="0.1"
            stdDeviation="1"
          />
        </filter>
        <marker
          id="cpu-circle-marker"
          markerHeight={lineMarkerSize}
          markerWidth={lineMarkerSize}
          refX="5"
          refY="5"
          viewBox="0 0 10 10"
        >
          <circle cx="5" cy="5" fill="currentColor" opacity="0.5" r="2" />
        </marker>
        <linearGradient
          id="cpu-connection-gradient"
          x1="0"
          x2="0"
          y1="0"
          y2="1"
        >
          <stop offset="0%" stopColor="#4F4F4F" />
          <stop offset="60%" stopColor="#121214" />
        </linearGradient>
        <linearGradient id="cpu-text-gradient" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#830CD1" />
          <stop offset="50%" stopColor="#00E8ED" />
          <stop offset="100%" stopColor="#FFD800" />
        </linearGradient>
      </defs>
    </svg>
  );
};

export { Architecture };

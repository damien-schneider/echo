import { getCurrentWindow } from "@tauri-apps/api/window";
import * as React from "react";
import { getNormalizedOsPlatform } from "@/lib/os";
import { cn } from "@/lib/utils";

// Cache platform at module level to avoid repeated calls
const platform = getNormalizedOsPlatform();
const isWindows = platform === "windows";
const isLinux = platform === "linux";

export interface GlassWindowProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * A glassmorphism container that provides the macOS-style transparent window effect.
 * When maximized, switches to a solid opaque background for better readability.
 */
const GlassWindow = ({
  className,
  children,
  ref,
  ...props
}: GlassWindowProps & { ref?: React.Ref<HTMLDivElement> }) => {
  const [isMaximized, setIsMaximized] = React.useState(false);

  React.useEffect(() => {
    const appWindow = getCurrentWindow();

    const updateIsMaximized = async () => {
      try {
        const maximized = await appWindow.isMaximized();
        setIsMaximized((prev) => (prev !== maximized ? maximized : prev));
      } catch {
        // Ignore errors when querying window state to avoid unhandled rejections
      }
    };

    // Check initial state
    void updateIsMaximized();

    // Listen for resize events to detect maximize/restore
    const unlisten = appWindow.onResized(async () => {
      await updateIsMaximized();
    });

    return () => {
      unlisten
        .then((fn) => fn())
        .catch(() => {
          // Ignore errors during listener cleanup
        });
    };
  }, []);
  // Determine window styles based on platform and state
  const getGlassStyles = () => {
    // Windows or maximized: no border radius, solid background
    if (isMaximized || isWindows) {
      return {
        borderRadius: "0",
        background: "var(--window-background)",
        border: "none",
        boxShadow: "none",
      };
    }

    // Linux: rounded corners with solid background (no glassmorphism)
    if (isLinux) {
      return {
        borderRadius: "var(--window-radius)",
        background: "var(--window-background)",
        border: "1px solid var(--window-border)",
        boxShadow: "var(--window-shadow)",
      };
    }

    // macOS: full glassmorphism
    return {
      borderRadius: "var(--window-radius)",
      background: "var(--window-background)",
      border: "1px solid var(--window-border)",
      boxShadow:
        "var(--window-shadow), inset 0 1px 0 0 var(--window-border-highlight)",
      backdropFilter: "blur(80px) saturate(200%) brightness(1.1)",
      WebkitBackdropFilter: "blur(80px) saturate(200%) brightness(1.1)",
    };
  };

  const glassStyles = getGlassStyles();

  return (
    <div
      className={cn(
        "relative flex h-screen flex-col overflow-hidden",
        className
      )}
      ref={ref}
      style={glassStyles as React.CSSProperties}
      {...props}
    >
      {/* Noise/grain overlay - only show when not maximized and not on Windows/Linux */}
      {!(isMaximized || isWindows || isLinux) && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            borderRadius: "var(--window-radius)",
            opacity: 0.04,
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          }}
        />
      )}
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
};
GlassWindow.displayName = "GlassWindow";

export { GlassWindow };

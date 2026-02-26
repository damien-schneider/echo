import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
  useEffect,
  useState,
} from "react";
import { getNormalizedOsPlatform } from "@/lib/os";
import { cn } from "@/lib/utils";

// Cache platform at module level to avoid repeated calls
const platform = getNormalizedOsPlatform();
const isWindows = platform === "windows";
const isLinux = platform === "linux";

export interface GlassWindowProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
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
}: GlassWindowProps & { ref?: Ref<HTMLDivElement> }) => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
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
    updateIsMaximized();

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

  return (
    <div
      className={cn(
        "relative flex h-screen flex-col bg-background/90 rounded-[1.25rem] backdrop-blur-sm",
        className
      )}
      ref={ref}
      style={{
        boxShadow: "var(--window-shadow)"
      }}
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
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='2.5' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          }}
        />
      )}

        {children}

    </div>
  );
};
GlassWindow.displayName = "GlassWindow";

export { GlassWindow };

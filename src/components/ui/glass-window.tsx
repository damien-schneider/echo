import * as React from "react";
import { cn } from "@/lib/utils";

export interface GlassWindowProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
}

/**
 * A glassmorphism container that provides the macOS-style transparent window effect.
 * This component wraps the entire app content and applies:
 * - Semi-transparent background
 * - Backdrop blur effect (when compositor supports it)
 * - Rounded corners
 * - Subtle border and shadow for elevation
 * - Noise/grain texture overlay for frosted glass effect
 */
const GlassWindow = React.forwardRef<HTMLDivElement, GlassWindowProps>(
    ({ className, children, ...props }, ref) => {
        return (
            <div
                className={cn(
                    "relative flex h-screen flex-col overflow-hidden",
                    className
                )}
                ref={ref}
                style={{
                    borderRadius: "var(--window-radius)",
                    background: "var(--window-background)",
                    border: "1px solid var(--window-border)",
                    boxShadow: "var(--window-shadow), inset 0 1px 0 0 var(--window-border-highlight)",
                    backdropFilter: "blur(80px) saturate(200%) brightness(1.1)",
                    WebkitBackdropFilter: "blur(80px) saturate(200%) brightness(1.1)",
                }}
                {...props}
            >
                {/* Noise/grain overlay for frosted glass effect */}
                <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                        borderRadius: "var(--window-radius)",
                        opacity: 0.04,
                        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
                    }}
                    aria-hidden="true"
                />
                <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
                    {children}
                </div>
            </div>
        );
    }
);
GlassWindow.displayName = "GlassWindow";

export { GlassWindow };

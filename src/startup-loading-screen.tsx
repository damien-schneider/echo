import { getCurrentWindow } from "@tauri-apps/api/window";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./App.css";
import EchoLogo from "@/components/icons/echo-logo";
import { Spinner } from "@/components/ui/spinner";
import { getNormalizedOsPlatform } from "@/lib/os";
import { ThemeProvider } from "@/providers/ThemeProvider";

// Cache platform at module level
const isWindows = getNormalizedOsPlatform() === "windows";

function Splashscreen() {
  useEffect(() => {
    const showWindow = async () => {
      try {
        const appWindow = getCurrentWindow();
        await appWindow.show();
      } catch (err) {
        console.error("Failed to show splash screen:", err);
      }
    };
    showWindow();
  }, []);

  return (
    <div
      className={`flex size-full h-42 w-72 items-center justify-center gap-3 overflow-hidden border bg-background text-muted-foreground ${
        isWindows ? "rounded-none" : "rounded-3xl"
      }`}
      data-tauri-drag-region
    >
      <Spinner className="size-8" />
      <EchoLogo className="w-32" variant="full" />
      <p className="sr-only">Starting Echo...</p>
    </div>
  );
}

const container = document.getElementById("splash-root");
if (!container) {
  throw new Error("Splashscreen root element not found");
}

const root = createRoot(container);
root.render(
  <StrictMode>
    <ThemeProvider>
      <Splashscreen />
    </ThemeProvider>
  </StrictMode>
);

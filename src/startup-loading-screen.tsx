import { StrictMode, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createRoot } from "react-dom/client";
import "./App.css";
import EchoLogo from "@/components/icons/echo-logo";
import { Spinner } from "@/components/ui/spinner";
import { ThemeProvider } from "@/providers/ThemeProvider";

function Splashscreen() {
  useEffect(() => {
    const showWindow = async () => {
      try {
        const appWindow = getCurrentWindow();
        await appWindow.show();
        console.log("Splash screen shown");
      } catch (err) {
        console.error("Failed to show splash screen:", err);
      }
    };
    showWindow();
  }, []);

  return (
    <div
      className={`flex size-full h-42 w-72 items-center justify-center gap-3 overflow-hidden border bg-background text-muted-foreground ${navigator.userAgent.includes("Windows") ? "rounded-none" : "rounded-3xl"
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

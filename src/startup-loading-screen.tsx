import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./App.css";
import EchoLogo from "@/components/icons/echo-logo";
import { Spinner } from "@/components/ui/spinner";
import { ThemeProvider } from "@/providers/ThemeProvider";

function Splashscreen() {
  return (
    <div
      className="flex size-full h-42 w-72 items-center justify-center gap-3 overflow-hidden rounded-3xl border bg-background text-muted-foreground"
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

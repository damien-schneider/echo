import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./App.css";
import { Spinner } from "@/components/ui/spinner";
import EchoLogo from "@/components/icons/echo-logo";
import { ThemeProvider } from "@/providers/ThemeProvider";

function Splashscreen() {
  return (
    <div
      className="size-full flex items-center justify-center gap-3 bg-background text-muted-foreground h-42 w-72 rounded-3xl border overflow-hidden"
      data-tauri-drag-region
    >
      <Spinner className="size-8" />
      <EchoLogo variant="full" className="w-32" />
      {/* <p className="text-sm">Starting Echo...</p> */}
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
  </StrictMode>,
);

import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "@/providers/theme-provider";
import RecordingOverlay from "./recording-overlay";
import "../app.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing root element");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="echo-ui-theme">
      <RecordingOverlay />
    </ThemeProvider>
  </React.StrictMode>
);

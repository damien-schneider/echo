import React from "react";
import ReactDOM from "react-dom/client";
import RecordingOverlay from "./recording-overlay";
import { ThemeProvider } from "../providers";
import "../App.css"

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="echo-ui-theme">
      <RecordingOverlay />
    </ThemeProvider>
  </React.StrictMode>,
);

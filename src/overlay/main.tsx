import { domAnimation, LazyMotion } from "motion/react";
import React from "react";
import ReactDOM from "react-dom/client";
import "@/app.css";
import RecordingOverlay from "@/overlay/recording-overlay";
import { ThemeProvider } from "@/providers/theme-provider";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing root element");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <LazyMotion features={domAnimation} strict={true}>
      <ThemeProvider defaultTheme="system" storageKey="echo-ui-theme">
        <RecordingOverlay />
      </ThemeProvider>
    </LazyMotion>
  </React.StrictMode>
);

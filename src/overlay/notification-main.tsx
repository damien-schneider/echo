import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import React from "react";
import ReactDOM from "react-dom/client";
import "@/app.css";
import NotificationOverlay from "@/overlay/notification-overlay";
import { ThemeProvider } from "@/providers/theme-provider";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing root element");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <LazyMotion features={domAnimation} strict={true}>
      <MotionConfig reducedMotion="user">
        <ThemeProvider defaultTheme="system" storageKey="echo-ui-theme">
          <NotificationOverlay />
        </ThemeProvider>
      </MotionConfig>
    </LazyMotion>
  </React.StrictMode>
);

import { EchoSkin } from "@echo/ui/skin";
import React from "react";
import ReactDOM from "react-dom/client";
import { RefletFeedback } from "reflet-sdk/feedback";
import App from "@/app";
import { ThemeProvider } from "@/providers/theme-provider";

const REFLET_PUBLIC_KEY = import.meta.env.VITE_REFLET_PUBLIC_KEY;

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing root element");
}
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <EchoSkin>
      <ThemeProvider defaultTheme="system" storageKey="echo-ui-theme">
        <App />
        <RefletFeedback
          enabled={Boolean(REFLET_PUBLIC_KEY)}
          publicKey={REFLET_PUBLIC_KEY}
        />
      </ThemeProvider>
    </EchoSkin>
  </React.StrictMode>
);

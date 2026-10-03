import { EchoSkin } from "@echo/ui/skin";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/app";
import { ThemeProvider } from "@/providers/theme-provider";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing root element");
}
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <EchoSkin>
      <ThemeProvider defaultTheme="system" storageKey="echo-ui-theme">
        <App />
      </ThemeProvider>
    </EchoSkin>
  </React.StrictMode>
);

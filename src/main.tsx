import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AiSdkPostProcessProvider, ThemeProvider } from "./providers";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="echo-ui-theme">
      <AiSdkPostProcessProvider>
        <App />
      </AiSdkPostProcessProvider>
    </ThemeProvider>
  </React.StrictMode>
);

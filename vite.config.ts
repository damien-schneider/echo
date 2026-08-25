import { resolve } from "node:path";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        overlay: resolve(import.meta.dirname, "src/overlay/index.html"),
        "overlay-notification": resolve(
          import.meta.dirname,
          "src/overlay/notification.html"
        ),
        "snap-preview": resolve(
          import.meta.dirname,
          "src/overlay/snap-preview.html"
        ),
        "startup-loading-screen": resolve(
          import.meta.dirname,
          "startup-loading-screen.html"
        ),
      },
    },
  },

  // Tauri-specific: keep rust errors visible, fixed port, ignore src-tauri.
  clearScreen: false,
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    hmr: host
      ? {
          host,
          port: 1421,
          protocol: "ws",
        }
      : undefined,
    host,
    port: 1425,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));

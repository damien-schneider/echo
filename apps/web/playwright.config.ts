import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.pw.ts",
  use: { baseURL: "http://localhost:3105", ...devices["Desktop Chrome"] },
  webServer: {
    command: "node .output/server/index.mjs",
    env: { PORT: "3105" },
    url: "http://localhost:3105",
    reuseExistingServer: false,
  },
});

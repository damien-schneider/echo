import { defineConfig, devices } from "@playwright/test";

const testPort = process.env.PLAYWRIGHT_PORT ?? "1420";
const testUrl = `http://localhost:${testPort}`;

export default defineConfig({
  forbidOnly: !!process.env.CI,
  fullyParallel: true,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  reporter: "list",
  retries: process.env.CI ? 2 : 0,
  testDir: "./e2e",
  use: {
    baseURL: testUrl,
    trace: "on-first-retry",
  },
  webServer: {
    command: `bun run dev -- --port ${testPort}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: testUrl,
  },
});

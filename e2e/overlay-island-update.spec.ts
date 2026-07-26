import {
  emitTauriEvent,
  invokedCommands,
  NOTIFICATION_URL,
  test,
  waitForTauriListener,
} from "@e2e/fixtures";
import { expect } from "@playwright/test";

const available = {
  error: null,
  phase: "available",
  progress: null,
  version: "9.9.9",
};

// The island morph never settles under a spring, so a click target only holds
// still with motion reduced.
const openNotificationWindow = async (
  page: Parameters<typeof emitTauriEvent>[0]
) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(NOTIFICATION_URL);
  await waitForTauriListener(page, "update-status");
};

test("an available update opens the notch with a button that installs it", async ({
  page,
}) => {
  await openNotificationWindow(page);

  await emitTauriEvent(page, "update-status", available);

  await expect(page.getByText("Update available — v9.9.9")).toBeVisible();
  await page
    .getByRole("button", { name: "Install the update and restart Echo" })
    .click();
  await expect.poll(() => invokedCommands(page)).toContain("install_update");
});

test("the notch follows the download and hands the surface back after", async ({
  page,
}) => {
  await openNotificationWindow(page);

  await emitTauriEvent(page, "update-status", {
    ...available,
    phase: "downloading",
    progress: 42,
  });

  const activity = page.locator(".echo-island-activity");
  await expect(page.getByText("Downloading update… 42%")).toBeVisible();
  await expect(activity).toHaveAttribute("data-state", "processing");
  await expect(
    page.getByRole("button", { name: "Dismiss update notice" })
  ).toBeHidden();

  await emitTauriEvent(page, "update-status", {
    error: null,
    phase: "idle",
    progress: null,
    version: null,
  });
  await expect(activity).toBeHidden();
});

test("recording takes the notch back from an update notice", async ({
  page,
}) => {
  await openNotificationWindow(page);
  await waitForTauriListener(page, "show-overlay");

  await emitTauriEvent(page, "update-status", available);
  await expect(page.getByText("Update available — v9.9.9")).toBeVisible();

  await emitTauriEvent(page, "show-overlay", "recording");
  await expect(page.getByText("Update available — v9.9.9")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Cancel current operation" })
  ).toBeVisible();
});

test("a dismissed update notice stays away until a new version arrives", async ({
  page,
}) => {
  await openNotificationWindow(page);

  await emitTauriEvent(page, "update-status", available);
  await page.getByRole("button", { name: "Dismiss update notice" }).click();
  await expect(page.getByText("Update available — v9.9.9")).toBeHidden();

  await emitTauriEvent(page, "update-status", {
    ...available,
    version: "9.9.9",
  });
  await expect(page.getByText("Update available — v9.9.9")).toBeHidden();

  await emitTauriEvent(page, "update-status", {
    ...available,
    version: "10.0.0",
  });
  await expect(page.getByText("Update available — v10.0.0")).toBeVisible();
});

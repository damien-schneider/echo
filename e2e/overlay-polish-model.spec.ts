import {
  emitTauriEvent,
  NOTIFICATION_URL,
  requestNotificationSurface,
  test,
  waitForTauriListener,
} from "@e2e/fixtures";
import { expect, type Page } from "@playwright/test";

const overlayUrl = `${NOTIFICATION_URL}?polish=not_downloaded`;
const polishModelId = "polish-qwen3-4b-instruct-2507";
const percentagePattern = /\d+%/;

const openPolishModelPanel = async (page: Page) => {
  await page.goto(overlayUrl);
  await waitForTauriListener(page, "model-download-progress", 2);
  await waitForTauriListener(page, "overlay-notification-request");
  await requestNotificationSurface(page, "panel");
  await expect(
    page.getByRole("dialog", { name: "Local Polish model" })
  ).toBeVisible();
};

const startPolishDownload = async (page: Page) => {
  await openPolishModelPanel(page);
  await page.getByRole("button", { name: "Download 2.5 GB" }).click();
};

const verificationProgress = (percentage: number) => ({
  downloaded: Math.round((2_497_280_448 * percentage) / 100),
  model_id: polishModelId,
  percentage,
  total: 2_497_280_448,
});

test("shows determinate zero progress immediately after Download", async ({
  page,
}) => {
  await startPolishDownload(page);

  const progress = page.getByRole("progressbar", {
    name: "Polish model download",
  });
  await expect(progress).toBeVisible();
  await expect(progress).toHaveAttribute("value", "0");
  await expect(
    page.getByRole("dialog", { name: "Local Polish model" })
  ).toContainText("0%");
});

test("shows real verification percentage from the verification event", async ({
  page,
}) => {
  await startPolishDownload(page);

  await emitTauriEvent(page, "model-verification-started", polishModelId);
  await emitTauriEvent(
    page,
    "model-verification-progress",
    verificationProgress(47)
  );

  const progress = page.getByRole("progressbar", {
    name: "Polish model verification",
  });
  await expect(progress).toBeVisible();
  await expect(progress).toHaveAttribute("value", "47");
  await expect(
    page.getByRole("dialog", { name: "Local Polish model" })
  ).toContainText("47%");
});

test("shows loading as an explicit indeterminate phase", async ({ page }) => {
  await openPolishModelPanel(page);

  await emitTauriEvent(page, "polish-status-changed", {
    message: "Loading Polish model",
    state: "loading",
  });

  const panel = page.getByRole("dialog", { name: "Local Polish model" });
  const progress = page.getByRole("progressbar", {
    name: "Polish model loading",
  });
  await expect(panel).toHaveAttribute("data-state", "loading");
  await expect(
    page.getByRole("heading", { name: "Loading Polish" })
  ).toBeVisible();
  await expect(progress).toBeVisible();
  await expect(progress).not.toHaveAttribute("value");
  await expect(panel.getByText(percentagePattern)).toHaveCount(0);
});

test("crossfades keyed status text inside one painted shell", async ({
  page,
}) => {
  await startPolishDownload(page);

  const shell = page.locator('[data-component="echo-island-morph"]');
  expect(
    await shell.evaluate((element) => {
      const style = getComputedStyle(element);
      return !(
        style.backgroundColor === "rgba(0, 0, 0, 0)" &&
        style.backgroundImage === "none"
      );
    })
  ).toBe(true);
  const shellBefore = await shell.elementHandle();
  const downloading = page.locator('[data-polish-status-layer="downloading"]');
  await expect(downloading).toHaveCount(1);

  await emitTauriEvent(page, "model-verification-started", polishModelId);
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  );

  const verifying = page.locator('[data-polish-status-layer="verifying"]');
  const shellAfter = await shell.elementHandle();
  await expect(verifying).toHaveCount(1);
  await expect(downloading).toHaveCount(1);
  if (!(shellBefore && shellAfter)) {
    throw new Error("Polish painted shell was not mounted");
  }
  expect(
    await page.evaluate(
      ([before, after]) => before === after,
      [shellBefore, shellAfter]
    )
  ).toBe(true);
  await expect(downloading).toHaveCount(0);
});

test("springs to the compact verification height without a jump", async ({
  page,
}) => {
  await openPolishModelPanel(page);
  await page.waitForTimeout(500);
  const shell = page.locator('[data-component="echo-island-morph"]');
  const heights = await shell.evaluate(async (element) => {
    const samples = [element.getBoundingClientRect().height];
    window.__ECHO_TEST__.emit(
      "model-verification-started",
      "polish-qwen3-4b-instruct-2507"
    );
    for (let frame = 0; frame < 50; frame += 1) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      samples.push(element.getBoundingClientRect().height);
    }
    return samples;
  });
  const start = heights[0] ?? 0;
  const end = heights.at(-1) ?? 0;

  expect(start - end).toBeGreaterThan(15);
  expect(end).toBeLessThan(130);
  expect(heights.some((height) => height < start - 1 && height > end + 1)).toBe(
    true
  );
});

test("late download progress cannot regress verification", async ({ page }) => {
  await startPolishDownload(page);
  await emitTauriEvent(page, "model-verification-started", polishModelId);
  await emitTauriEvent(
    page,
    "model-verification-progress",
    verificationProgress(47)
  );
  await expect(
    page.getByRole("heading", { name: "Verifying Polish" })
  ).toBeVisible();

  await emitTauriEvent(page, "model-download-progress", {
    downloaded: 2_472_307_644,
    model_id: polishModelId,
    percentage: 99,
    total: 2_497_280_448,
  });

  await expect(
    page.getByRole("heading", { name: "Verifying Polish" })
  ).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "Polish model verification" })
  ).toHaveAttribute("value", "47");
  await expect(
    page.getByRole("progressbar", { name: "Polish model download" })
  ).toBeHidden();
});

test("late download progress cannot regress loading", async ({ page }) => {
  await startPolishDownload(page);
  await emitTauriEvent(page, "polish-status-changed", {
    message: "Loading Polish model",
    state: "loading",
  });
  await expect(
    page.getByRole("progressbar", { name: "Polish model loading" })
  ).toBeVisible();

  await emitTauriEvent(page, "model-download-progress", {
    downloaded: 2_472_307_644,
    model_id: polishModelId,
    percentage: 99,
    total: 2_497_280_448,
  });

  await expect(
    page.getByRole("heading", { name: "Loading Polish" })
  ).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "Polish model loading" })
  ).not.toHaveAttribute("value");
  await expect(
    page.getByRole("progressbar", { name: "Polish model download" })
  ).toBeHidden();
});

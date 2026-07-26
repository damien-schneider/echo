import {
  emitTauriEvent,
  HUD_URL,
  invokedCommands,
  NOTIFICATION_URL,
  requestNotificationSurface,
  setTauriPolishStatus,
  test,
  waitForTauriListener,
} from "@e2e/fixtures";
import { expect } from "@playwright/test";

test("chat opens passively and accepts focus only after an input click", async ({
  page,
}) => {
  await page.goto(`${NOTIFICATION_URL}?polish=ready`);
  await waitForTauriListener(page, "overlay-notification-request");
  await requestNotificationSurface(page, "chat");
  const chatInput = page.getByPlaceholder("Ask anything");
  await expect(chatInput).toBeVisible();
  await expect(chatInput).not.toBeFocused();

  await chatInput.click();
  await expect(chatInput).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(page.getByPlaceholder("Ask anything")).toBeHidden();
});

test("the HUD hands chat and Polish to the notification window", async ({
  page,
}) => {
  await page.goto(`${HUD_URL}?polish=not_downloaded`);
  await page.getByRole("button", { name: "Open Echo chat" }).click();

  await expect
    .poll(() => invokedCommands(page))
    .toContain("request_overlay_notification");
  // The HUD draws neither of them: it folds back into its handle.
  await expect(page.getByPlaceholder("Ask anything")).toBeHidden();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("closing chat reveals a background download instead of dismissing it", async ({
  page,
}) => {
  await page.goto(`${NOTIFICATION_URL}?polish=ready`);
  await waitForTauriListener(page, "model-download-progress");
  await waitForTauriListener(page, "overlay-notification-request");
  await requestNotificationSurface(page, "chat");
  await emitTauriEvent(page, "model-download-progress", {
    downloaded: 249_728_045,
    model_id: "polish-qwen3-4b-instruct-2507",
    percentage: 10,
    total: 2_497_280_448,
  });

  await page.getByRole("button", { name: "Close chat" }).click();
  await page.mouse.move(0, 0);

  await expect(page.getByText("Downloading Polish… 10%")).toBeVisible();
});

test("a failed recording action is reported through the notification", async ({
  page,
}) => {
  await page.goto(
    `${HUD_URL}?reject=start_transcription_from_overlay&polish=ready`
  );
  await page.getByRole("button", { name: "Start recording" }).click();

  await expect.poll(() => invokedCommands(page)).toContain("warn_from_overlay");
  const commands = await invokedCommands(page);
  expect(commands).not.toContain("register_escape_shortcut");
});

test("a broken event bridge shows a persistent recovery message", async ({
  page,
}) => {
  await page.goto(`${NOTIFICATION_URL}?rejectEvent=show-overlay&polish=ready`);

  await expect(page.getByRole("alert")).toHaveText(
    "Echo controls lost their connection. Reopen Echo and try again."
  );
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(page.getByRole("alert")).toBeHidden();
});

test("a dismissed background download stays out of the HUD", async ({
  page,
}) => {
  await page.goto(`${NOTIFICATION_URL}?polish=ready`);
  await waitForTauriListener(page, "model-download-progress");
  const progress = {
    downloaded: 249_728_045,
    model_id: "polish-qwen3-4b-instruct-2507",
    percentage: 10,
    total: 2_497_280_448,
  };
  await emitTauriEvent(page, "model-download-progress", progress);
  await expect(page.getByText("Downloading Polish… 10%")).toBeVisible();

  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(page.getByText("Downloading Polish… 10%")).toBeHidden();
  await emitTauriEvent(page, "model-download-progress", {
    ...progress,
    percentage: 11,
  });
  await expect(page.getByText("Downloading Polish… 11%")).toBeHidden();
});

test("a transient warning dismisses locally without cancelling work", async ({
  page,
}) => {
  await page.goto(`${NOTIFICATION_URL}?polish=ready`);
  await waitForTauriListener(page, "show-overlay");
  await emitTauriEvent(page, "show-overlay", {
    message: "No selected text was copied",
    state: "warning",
  });

  await expect(page.getByText("No selected text was copied")).toBeVisible();
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(page.getByText("No selected text was copied")).toBeHidden();
  const commands = await invokedCommands(page);
  expect(commands).not.toContain("cancel_operation");
  expect(commands).not.toContain("register_escape_shortcut");
});

test("missing Polish opens download progress, failure, and retry states", async ({
  page,
}) => {
  await page.goto(`${NOTIFICATION_URL}?polish=not_downloaded`);
  await waitForTauriListener(page, "model-download-progress", 2);
  await waitForTauriListener(page, "overlay-notification-request");
  await requestNotificationSurface(page, "panel");

  const panel = page.getByRole("dialog", { name: "Local Polish model" });
  await expect(panel).toBeVisible();
  await expect(panel).toHaveJSProperty("tagName", "DIALOG");
  await expect(page.getByRole("heading", { name: "Polish" })).toBeVisible();
  await page.getByRole("button", { name: "Download 2.5 GB" }).click();
  await emitTauriEvent(page, "model-download-progress", {
    downloaded: 624_320_112,
    model_id: "polish-qwen3-4b-instruct-2507",
    percentage: 25,
    total: 2_497_280_448,
  });
  await expect(
    page.getByRole("progressbar", { name: "Polish model download" })
  ).toHaveAttribute("value", "25");

  await emitTauriEvent(
    page,
    "model-download-failed",
    "polish-qwen3-4b-instruct-2507"
  );
  await expect(page.getByRole("alert")).toContainText(
    "Check your connection and retry"
  );
  await page.getByRole("button", { name: "Repair Polish" }).click();
  await expect
    .poll(() => invokedCommands(page))
    .toContain("repair_polish_model");
});

test("download completion becomes ready without polishing stale text", async ({
  page,
}) => {
  await page.goto(`${NOTIFICATION_URL}?polish=not_downloaded`);
  await waitForTauriListener(page, "model-verification-started");
  await waitForTauriListener(page, "model-download-complete", 2);
  await waitForTauriListener(page, "overlay-notification-request");
  await requestNotificationSurface(page, "panel");
  await page.getByRole("button", { name: "Download 2.5 GB" }).click();

  await emitTauriEvent(
    page,
    "model-verification-started",
    "polish-qwen3-4b-instruct-2507"
  );
  await expect(
    page.getByRole("heading", { name: "Verifying Polish" })
  ).toBeVisible();

  await setTauriPolishStatus(page, "ready");
  await emitTauriEvent(page, "polish-status-changed", {
    message: "Polish is ready",
    state: "ready",
  });
  await emitTauriEvent(
    page,
    "model-download-complete",
    "polish-qwen3-4b-instruct-2507"
  );
  await expect(
    page.getByRole("heading", { name: "Polish ready" })
  ).toBeVisible();
  expect(await invokedCommands(page)).not.toContain("run_polish_from_overlay");
});

test("shortcut recording replaces a passive model panel with activity", async ({
  page,
}) => {
  await page.goto(`${NOTIFICATION_URL}?polish=not_downloaded`);
  await waitForTauriListener(page, "show-overlay");
  await waitForTauriListener(page, "hide-overlay");
  await waitForTauriListener(page, "overlay-notification-request");
  await requestNotificationSurface(page, "panel");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close Polish model panel" })
  ).not.toBeFocused();

  await emitTauriEvent(page, "show-overlay", "recording");

  await expect(
    page.getByRole("region", { name: "Echo activity" })
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect
    .poll(() => invokedCommands(page))
    .toContain("set_overlay_notification_mode");

  await page.mouse.move(0, 0);
  await emitTauriEvent(page, "hide-overlay", null);
  await expect(page.getByRole("dialog")).toBeHidden();
  // Nothing left to say: the window folds back into the notch and stands down.
  await expect
    .poll(() => invokedCommands(page))
    .toContain("hide_overlay_notification");
});

test("model panel close works without capturing idle Escape", async ({
  page,
}) => {
  await page.goto(`${NOTIFICATION_URL}?polish=not_downloaded`);
  await waitForTauriListener(page, "overlay-notification-request");
  await requestNotificationSurface(page, "panel");
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.getByRole("button", { name: "Close Polish model panel" }).click();

  await expect(page.getByRole("dialog")).toBeHidden();
  const commands = await invokedCommands(page);
  expect(commands).not.toContain("register_escape_shortcut");
});

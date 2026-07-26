import {
  emitTauriEvent,
  invokedCommands,
  NOTIFICATION_URL,
  test,
  waitForTauriListener,
} from "@e2e/fixtures";
import { expect } from "@playwright/test";

const overlayUrl = `${NOTIFICATION_URL}?polish=ready`;

test("recording offers explicit transcribe and cancel actions", async ({
  page,
}) => {
  await page.goto(overlayUrl);
  await waitForTauriListener(page, "show-overlay");
  await waitForTauriListener(page, "mic-level");

  await emitTauriEvent(page, "show-overlay", "recording");
  await expect(page.locator(".recording-overlay-root")).toHaveAttribute(
    "data-anchor",
    "top"
  );
  await expect(page.locator(".recording-overlay-root")).toHaveAttribute(
    "data-presentation",
    "bar"
  );
  await expect(page.getByText("Listening…")).toBeHidden();
  await expect(page.locator(".notch-bar-delay-0")).toHaveCount(0);

  const ambience = page.locator(".echo-island-microphone-ambience");
  await expect(ambience).toBeVisible();
  expect(
    await ambience.evaluate((element) => getComputedStyle(element).maskImage)
  ).not.toBe("none");
  const quietEnergy = await ambience.evaluate((element) =>
    getComputedStyle(element).getPropertyValue("--echo-mic-energy")
  );
  await emitTauriEvent(page, "mic-level", [0.8, 0.9, 0.7, 1]);
  await expect
    .poll(() =>
      ambience.evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--echo-mic-energy")
      )
    )
    .not.toBe(quietEnergy);

  const activity = page.locator(".echo-island-activity");
  await expect(activity).toHaveAttribute("data-has-text", "false");
  await emitTauriEvent(
    page,
    "transcription-progress",
    "Speech before a long pause remains visible."
  );
  await expect(activity).toHaveAttribute("data-has-text", "true");
  await expect(activity).toHaveCSS("width", "310px");
  await expect(
    page.getByText("Speech before a long pause remains visible.")
  ).toBeVisible();

  const submit = page.getByRole("button", {
    name: "Finish recording and transcribe",
  });
  await expect(submit).toBeVisible();
  await submit.click();
  await expect
    .poll(() => invokedCommands(page))
    .toContain("stop_transcription_from_overlay");

  await page.getByRole("button", { name: "Cancel current operation" }).click();
  await expect.poll(() => invokedCommands(page)).toContain("cancel_operation");
});

test("recording ambience becomes still with reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(overlayUrl);
  await waitForTauriListener(page, "show-overlay");
  await emitTauriEvent(page, "show-overlay", "recording");

  await expect(page.locator(".echo-island-microphone-ambience")).toHaveCSS(
    "animation-name",
    "none"
  );
});

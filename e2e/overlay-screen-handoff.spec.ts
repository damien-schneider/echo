import {
  emitTauriEvent,
  HUD_URL,
  invokedCommands,
  test,
  waitForTauriListener,
} from "@e2e/fixtures";
import { expect, type Page } from "@playwright/test";

const HANDOFF_EVENT = "overlay-screen-handoff";
const MOVE_COMMAND = "move_recording_overlay_to_cursor_screen";

const waitForHandoffPhase = (page: Page, phase: string) =>
  page.waitForFunction(
    (expected) =>
      document
        .querySelector(".recording-overlay-root")
        ?.getAttribute("data-handoff") === expected,
    phase,
    { polling: "raf" }
  );

/// The island must be gone before the window jumps, so the snapshot is taken
/// mid-fade rather than after it.
const commandsWhileFading = (page: Page) =>
  page
    .waitForFunction(
      () => {
        const island = document.querySelector(".echo-island-morph");
        if (!island) {
          return null;
        }
        const opacity = Number(getComputedStyle(island).opacity);
        return opacity < 0.5
          ? { commands: [...window.__ECHO_TEST__.commands] }
          : null;
      },
      undefined,
      { polling: "raf" }
    )
    .then((snapshot) => snapshot.jsonValue());

test("fades the island out before the window changes screens", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(HUD_URL);
  await waitForTauriListener(page, HANDOFF_EVENT);
  const root = page.locator(".recording-overlay-root");
  const island = page.locator(".echo-island-morph");

  await emitTauriEvent(page, HANDOFF_EVENT, null);
  await expect(root).toHaveAttribute("data-handoff", "leaving");
  const fading = await commandsWhileFading(page);
  expect(fading.commands).not.toContain(MOVE_COMMAND);

  await expect
    .poll(async () => (await invokedCommands(page)).includes(MOVE_COMMAND))
    .toBe(true);
  await waitForHandoffPhase(page, "arriving");
  await waitForHandoffPhase(page, "idle");
  await expect(island).toHaveCSS("opacity", "1");
  await expect(island).toHaveCSS("filter", "none");
});

test("a refused move still brings the island back", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`${HUD_URL}?reject=${MOVE_COMMAND}`);
  await waitForTauriListener(page, HANDOFF_EVENT);
  const island = page.locator(".echo-island-morph");

  await emitTauriEvent(page, HANDOFF_EVENT, null);
  await waitForHandoffPhase(page, "leaving");
  await waitForHandoffPhase(page, "idle");
  await expect(island).toHaveCSS("opacity", "1");
});

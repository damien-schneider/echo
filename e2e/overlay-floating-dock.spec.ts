import { invokedCommands, test, waitForTauriListener } from "@e2e/fixtures";
import {
  pointNative,
  requiredBox,
  settledFrame,
} from "@e2e/overlay-island-probe";
import { expect, type Page } from "@playwright/test";
import { DOCK_GEAR_DIAMETER } from "@/features/overlay-controls/motion/dock-silhouette";

const bottomDockUrl =
  "/src/overlay/index.html?polish=ready&overlayPlacement=bottom";

const islandPartAt = (page: Page, x: number, y: number) =>
  page.evaluate(
    (point) => {
      const hit = document.elementFromPoint(point.x, point.y);
      if (!hit?.closest('[data-component="echo-island-morph"]')) {
        return null;
      }
      return hit.closest("button")?.getAttribute("aria-label") ?? "island";
    },
    { x, y }
  );

const handleReturnsWithin = (page: Page, milliseconds: number) =>
  page.evaluate(
    (timeout) =>
      new Promise<boolean>((resolve) => {
        const observer = new MutationObserver(() => {
          if (document.querySelector(".echo-island-handle-hitbox")) {
            observer.disconnect();
            resolve(true);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => {
          observer.disconnect();
          resolve(false);
        }, timeout);
      }),
    milliseconds
  );

test("the pointer pressed into the bottom edge opens the floating dock and keeps it open", async ({
  page,
}) => {
  await page.setViewportSize({ height: 620, width: 680 });
  await page.goto(bottomDockUrl);
  await waitForTauriListener(page, "overlay-surface");
  const toolbar = page.getByRole("toolbar", { name: "Echo actions" });
  await expect(toolbar).toBeHidden();

  await page.mouse.move(340, 619);
  await expect(toolbar).toBeVisible();
  const collapsed = handleReturnsWithin(page, 400);
  await page.mouse.move(341, 619);

  expect(await collapsed).toBe(false);
});

test("hovered, a bottom dock floats as a pill with its gear split off beside it", async ({
  page,
}) => {
  await page.setViewportSize({ height: 620, width: 680 });
  await page.goto(bottomDockUrl);
  await waitForTauriListener(page, "overlay-pointer");
  const morph = page.locator('[data-component="echo-island-morph"]');
  const gear = page.getByRole("button", { name: "Open Echo settings" });

  await pointNative(page, true);
  await expect(gear).toHaveAttribute("data-revealed", "true");
  await expect(
    page.getByRole("button", { name: "Move Echo control" })
  ).toBeVisible();
  const frame = await settledFrame(morph);
  expect(Math.round(620 - frame.y - frame.height)).toBe(4);

  const panel = await requiredBox(page.locator(".echo-island-resident-panel"));
  const gearBox = await requiredBox(gear);
  const gearCenter = gearBox.x + gearBox.width / 2;
  const middle = frame.y + frame.height / 2;
  const pillEnd = panel.x + panel.width;
  const bubbleStart = gearCenter - DOCK_GEAR_DIAMETER / 2;
  expect(bubbleStart).toBeGreaterThan(pillEnd);
  await expect
    .poll(() => islandPartAt(page, (pillEnd + bubbleStart) / 2, middle))
    .toBeNull();
  expect(await islandPartAt(page, gearCenter, middle)).toBe(
    "Open Echo settings"
  );

  await gear.click();
  await expect
    .poll(() => invokedCommands(page))
    .toContain("open_settings_from_overlay");
});

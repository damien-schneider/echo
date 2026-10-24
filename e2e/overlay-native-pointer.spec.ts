import { test, waitForTauriListener } from "@e2e/fixtures";
import { pointNative, requiredBox } from "@e2e/overlay-island-probe";
import { expect, type Page } from "@playwright/test";

const sideDockUrl = "/src/overlay/index.html";
const barUrl = `${sideDockUrl}?overlayPlacement=bottom`;

test("native hover crossings leave the side dock exactly where it was", async ({
  page,
}) => {
  await page.goto(sideDockUrl);
  await waitForTauriListener(page, "overlay-pointer");
  const resident = page.locator(".echo-island-resident");
  const record = page.getByRole("button", { name: "Start recording" });
  const geometry = () =>
    page.evaluate(() => {
      const island = document.querySelector<HTMLElement>(".echo-island-morph");
      const action = document.querySelector<HTMLElement>(".echo-island-action");
      if (!(island && action)) {
        throw new Error("Side resident geometry is unavailable");
      }
      const islandBox = island.getBoundingClientRect();
      const actionBox = action.getBoundingClientRect();
      return {
        edgeGap: innerWidth - islandBox.right,
        rightInset: islandBox.right - actionBox.right,
        width: islandBox.width,
      };
    });

  await pointNative(page, false);
  await expect(resident).toHaveAttribute("data-active", "false");
  await page.waitForTimeout(260);
  const idle = await geometry();

  await resident.hover();
  await pointNative(page, true);
  await expect(resident).toHaveAttribute("data-active", "true");
  await page.waitForTimeout(260);
  const active = await geometry();

  await record.focus();
  await record.dispatchEvent("pointerdown", {
    button: 0,
    isPrimary: true,
    pointerType: "mouse",
  });
  await pointNative(page, false);
  await expect(resident).toHaveAttribute("data-active", "false");
  await page.waitForTimeout(260);
  const released = await geometry();

  expect([idle.edgeGap, active.edgeGap, released.edgeGap]).toEqual([0, 0, 0]);
  expect(active).toEqual(idle);
  expect(released).toEqual(idle);
});

test("native hover fills the aimed action at once and outranks WebKit's trailing :hover", async ({
  page,
}) => {
  await page.goto(sideDockUrl);
  await waitForTauriListener(page, "overlay-pointer");
  const record = page.getByRole("button", { name: "Start recording" });
  const chat = page.getByRole("button", { name: "Open Echo chat" });
  const restingFill = await chat.evaluate(
    (element) => getComputedStyle(element).backgroundColor
  );

  await record.hover();
  const chatBox = await requiredBox(chat);
  const fillOnArrival = await chat.evaluate(
    (element, pointer) => {
      window.__ECHO_TEST__.emit("overlay-pointer", pointer);
      return getComputedStyle(element).backgroundColor;
    },
    {
      inside: true,
      x: chatBox.x + chatBox.width / 2,
      y: chatBox.y + chatBox.height / 2,
    }
  );

  expect(fillOnArrival).not.toBe(restingFill);
  await expect(record).toHaveCSS("background-color", restingFill);
  await expect(record).toHaveCSS("scale", "1");
});

interface MorphFrame {
  centerGap: number;
  connected: boolean;
  edgeGap: number;
  height: number;
  width: number;
}

// Samples every frame of collapse → expand → interrupted collapse → re-expand at the bottom edge.
const sampleBoundaryTrajectory = (page: Page) =>
  page.evaluate(async () => {
    const island = document.querySelector<HTMLElement>(
      '[data-component="echo-island-morph"]'
    );
    if (!island) {
      throw new Error("Resident island geometry is unavailable");
    }
    const readFrame = (): MorphFrame => {
      const bounds = island.getBoundingClientRect();
      return {
        centerGap: bounds.left + bounds.width / 2 - innerWidth / 2,
        connected: island.isConnected,
        edgeGap: innerHeight - bounds.bottom,
        height: Math.round(bounds.height),
        width: Math.round(bounds.width),
      };
    };
    const sizeOf = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) {
        throw new Error(`${selector} is not rendered`);
      }
      return { height: element.offsetHeight, width: element.offsetWidth };
    };
    const samples: MorphFrame[] = [];
    const settle = async (inside: boolean, frames: number) => {
      window.__ECHO_TEST__.emit("overlay-pointer", { inside, x: 0, y: 0 });
      for (let frame = 0; frame < frames; frame += 1) {
        const { promise, resolve } = Promise.withResolvers<void>();
        requestAnimationFrame(() => resolve());
        await promise;
        samples.push(readFrame());
      }
      return readFrame();
    };

    const collapsed = await settle(false, 60);
    const handle = sizeOf(".echo-island-handle-hitbox");
    const expanded = await settle(true, 60);
    const residentSize = sizeOf(".echo-island-resident");
    await settle(false, 4);
    const closingPhase = document.querySelector<HTMLElement>(
      ".echo-island-handle-hitbox"
    )?.dataset.motion;
    const reversed = await settle(true, 60);
    return {
      closingPhase,
      collapsed,
      expanded,
      handle,
      residentSize,
      reversed,
      samples,
    };
  });

test("native pointer boundary reverses a connected resident morph", async ({
  page,
}) => {
  await page.goto(barUrl);
  await waitForTauriListener(page, "overlay-pointer");
  const toolbar = page.getByRole("toolbar", { name: "Echo actions" });

  await pointNative(page, true);
  await expect(toolbar).toBeVisible();

  const trajectory = await sampleBoundaryTrajectory(page);

  // the shell lands on the handle and the resident boxes, never a stale size between them
  expect(trajectory.collapsed).toMatchObject(trajectory.handle);
  expect(trajectory.expanded).toMatchObject(trajectory.residentSize);
  expect(trajectory.closingPhase).toBe("closing");
  expect(trajectory.reversed).toMatchObject(trajectory.residentSize);
  expect(
    trajectory.samples.every(
      ({ connected, height, width }) =>
        connected &&
        Number.isFinite(width) &&
        width > 0 &&
        Number.isFinite(height) &&
        height > 0
    )
  ).toBe(true);
  expect(
    Math.max(...trajectory.samples.map(({ centerGap }) => Math.abs(centerGap)))
  ).toBeLessThanOrEqual(1);
  expect(
    Math.max(...trajectory.samples.map(({ edgeGap }) => Math.abs(edgeGap - 4)))
  ).toBeLessThanOrEqual(1);
  await expect(toolbar).toBeVisible();
});

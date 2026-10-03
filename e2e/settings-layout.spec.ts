import { test } from "@e2e/fixtures";
import { expect } from "@playwright/test";

test("section headings stay quiet on hover and collapse with the keyboard", async ({
  page,
}) => {
  await page.goto("/?accessibility=granted");
  const startup = page.getByRole("button", { name: "Startup", exact: true });
  const background = await startup.evaluate(
    (element) => getComputedStyle(element).backgroundColor
  );
  await startup.hover();
  await expect(startup).toHaveCSS("background-color", background);
  await startup.focus();
  await page.keyboard.press("Space");
  await expect(startup).toHaveAttribute("aria-expanded", "false");
  await expect(startup).toHaveCSS("outline-style", "solid");
  await expect(startup).toHaveCSS("outline-width", "2px");
  await expect(
    page.getByRole("switch", { name: "Start hidden", exact: true })
  ).toHaveCount(0);
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("switch", { name: "Start hidden", exact: true })
  ).toBeVisible();
});

test("settings rows meet their divider without empty form gaps", async ({
  page,
}) => {
  await page.goto("/?accessibility=granted");
  const startup = page
    .locator('[data-control-ui="collapsible"][data-slot="root"]')
    .filter({
      has: page.getByRole("button", { name: "Startup", exact: true }),
    });
  const rows = startup.locator(
    '[data-field-kind="field"][data-slot="group"] > *'
  );
  await expect(rows).toHaveCount(2);
  const bounds = await rows.evaluateAll((elements) =>
    elements.map((element) => {
      const { top, bottom } = element.getBoundingClientRect();
      return { top, bottom };
    })
  );
  expect(bounds[1].top - bounds[0].bottom).toBeLessThanOrEqual(1);
});

test("sidebar navigation works at Echo's default window size and can collapse", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 680 });
  await page.goto("/?accessibility=granted");
  const navigation = page.getByRole("navigation", { name: "Settings" });
  await expect(navigation).toBeVisible();
  await expect(
    navigation.getByRole("button", { name: "General", exact: true })
  ).toHaveAttribute("aria-current", "page");
  await navigation
    .getByRole("button", { name: "Transcription", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Transcription", exact: true, level: 1 })
  ).toBeVisible();
  const toggle = page.getByRole("button", {
    name: "Toggle sidebar",
    exact: true,
  });
  const rail = page.getByRole("separator", { name: "Resize sidebar" });
  await rail.focus();
  await page.keyboard.press("End");
  await expect(rail).toHaveAttribute("aria-valuenow", "280");
  await page.keyboard.press("Home");
  await expect(rail).toHaveAttribute("aria-valuenow", "184");
  await toggle.focus();
  await page.keyboard.press("Control+b");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await navigation
    .getByRole("button", { name: "General", exact: true })
    .evaluate((button) => button.focus());
  await expect(toggle).toBeFocused();
  await page.keyboard.press("Control+b");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(
    navigation.getByRole("button", { name: "Transcription", exact: true })
  ).toHaveAttribute("aria-current", "page");
});

test("controls stay inside settings rows when descriptions wrap", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 680 });
  await page.goto("/?accessibility=granted");
  await page
    .getByRole("navigation", { name: "Settings" })
    .getByRole("button", { name: "Transcription", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Language", exact: true })
  ).toBeVisible();
  const overflowingControls = await page
    .locator('[data-field-kind="field"][data-slot="root"]')
    .evaluateAll((rows) =>
      rows.flatMap((row) => {
        const bounds = row.getBoundingClientRect();
        return [...row.querySelectorAll('[data-control="true"]')]
          .filter((control) => {
            const controlBounds = control.getBoundingClientRect();
            return (
              controlBounds.width > 0 &&
              (controlBounds.left < bounds.left ||
                controlBounds.right > bounds.right)
            );
          })
          .map(
            (control) =>
              control.getAttribute("aria-label") ?? control.textContent
          );
      })
    );
  expect(overflowingControls).toEqual([]);
});

test("narrow navigation closes after selection and leaves settings reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/?accessibility=granted");
  const toggle = page.getByRole("button", {
    name: "Toggle sidebar",
    exact: true,
  });
  await toggle.click();
  await page
    .getByRole("navigation", { name: "Settings" })
    .getByRole("button", { name: "Keyboard", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Keyboard", exact: true, level: 1 })
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
});

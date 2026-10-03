import { expect, test } from "@playwright/test";

const DARK_CLASS = /dark/;

test("website shares the Echo skin in both color modes", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-skin", "echo");
  const theme = page
    .getByRole("button", { name: "Toggle color theme" })
    .first();
  await expect(theme).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCSS(
    "opacity",
    "1"
  );
  await expect(
    page.getByRole("link", { name: "Download Echo — it’s free" }).locator("..")
  ).toHaveCSS("opacity", "1");
  await page.screenshot({ path: testInfo.outputPath("website-dark.png") });
  await theme.click();
  await expect(page.locator("html")).not.toHaveClass(DARK_CLASS);
  await expect(theme).toHaveAttribute("aria-pressed", "false");
  await page.screenshot({ path: testInfo.outputPath("website-light.png") });
  await expect(
    page.locator('[data-control-ui="button"]').first()
  ).toBeVisible();
});

test("FAQ accordions can be operated by keyboard", async ({ page }) => {
  await page.goto("/faq");
  const question = page.getByRole("button", {
    name: "What is Echo?",
    exact: true,
  });
  await question.focus();
  const expanded = await question.getAttribute("aria-expanded");
  await page.keyboard.press("Enter");
  await expect(question).toHaveAttribute(
    "aria-expanded",
    expanded === "true" ? "false" : "true"
  );
});

test("mobile navigation has a reachable toggle and closes with Escape", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const navigation = page.getByRole("button", { name: "Toggle navigation" });
  await navigation.click();
  await expect(navigation).toHaveAttribute("aria-expanded", "true");
  await page
    .locator("#echo-navigation")
    .getByRole("link", { name: "FAQ", exact: true })
    .focus();
  await page.keyboard.press("Escape");
  await expect(navigation).toHaveAttribute("aria-expanded", "false");
  await expect(navigation).toBeFocused();
  await expect(page.locator("#echo-navigation")).not.toBeAttached();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCSS(
    "opacity",
    "1"
  );
  await page.screenshot({ path: testInfo.outputPath("website-mobile.png") });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
});

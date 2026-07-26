import { test } from "@e2e/fixtures";
import { expect } from "@playwright/test";

test("app shell renders without crashing", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#root")).toBeAttached();
  await page.waitForFunction(
    () => {
      const root = document.querySelector("#root");
      return root !== null && root.children.length > 0;
    },
    { timeout: 15_000 }
  );
});

import { setAccessibilityPermission, test } from "@e2e/fixtures";
import { expect, type Page } from "@playwright/test";

const permissionTitle = "Accessibility access is not active for this build";
const permissionCheckCommand =
  "plugin:macos-permissions|check_accessibility_permission";
const permissionRequestCommand =
  "plugin:macos-permissions|request_accessibility_permission";

const showDeniedPermissionCard = async (page: Page) => {
  await page.goto("/");
  await expect(page.getByText(permissionTitle)).toBeVisible();
};

const failNextAccessibilityChecks = (page: Page, count: number) =>
  page.evaluate(
    (failureCount) =>
      window.__ECHO_TEST__.failNextAccessibilityChecks(failureCount),
    count
  );

const deferNextAccessibilityChecks = (page: Page, count: number) =>
  page.evaluate(
    (checkCount) =>
      window.__ECHO_TEST__.deferNextAccessibilityChecks(checkCount),
    count
  );

const resolveAccessibilityCheck = (
  page: Page,
  index: number,
  granted: boolean
) =>
  page.evaluate(
    ({ checkIndex, isGranted }) =>
      window.__ECHO_TEST__.resolveAccessibilityCheck(checkIndex, isGranted),
    { checkIndex: index, isGranted: granted }
  );

const waitForPendingAccessibilityChecks = (page: Page, count: number) =>
  page.waitForFunction(
    (checkCount) =>
      window.__ECHO_TEST__.pendingAccessibilityCheckCount() === checkCount,
    count
  );

test("accepts a valid permission result on initial mount", async ({ page }) => {
  await page.goto("/?accessibility=granted");

  await expect(page.getByText(permissionTitle)).toBeHidden();
});

test("explains how to refresh a stale rebuilt development identity", async ({
  page,
}) => {
  await showDeniedPermissionCard(page);

  await expect(
    page.getByText(
      "If a development entry is already enabled, remove it and add the rebuilt executable again."
    )
  ).toBeVisible();
});

test("rechecks access when the Echo window regains focus", async ({ page }) => {
  await showDeniedPermissionCard(page);
  await setAccessibilityPermission(page, true);

  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  await expect(page.getByText(permissionTitle)).toBeHidden();
});

test("rechecks access when the document becomes visible", async ({ page }) => {
  await showDeniedPermissionCard(page);
  await setAccessibilityPermission(page, true);

  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange"))
  );

  await expect(page.getByText(permissionTitle)).toBeHidden();
});

test("keeps checking after requesting access until this build is trusted", async ({
  page,
}) => {
  await showDeniedPermissionCard(page);
  await page
    .getByRole("button", { name: "Request Accessibility Access" })
    .click();
  await expect(
    page.getByText("Waiting for Accessibility access")
  ).toBeVisible();

  await setAccessibilityPermission(page, true);

  await expect(page.getByText("Waiting for Accessibility access")).toBeHidden({
    timeout: 3000,
  });
});

test("recovers when a verification check fails transiently", async ({
  page,
}) => {
  await showDeniedPermissionCard(page);
  await failNextAccessibilityChecks(page, 1);
  await setAccessibilityPermission(page, true);

  await page
    .getByRole("button", { name: "Request Accessibility Access" })
    .click();

  await expect(page.getByText(permissionTitle)).toBeHidden({ timeout: 3000 });
});

test("shows denied state when the latest check reports revoked access", async ({
  page,
}) => {
  await page.goto("/?accessibility=granted");
  await expect(page.getByText(permissionTitle)).toBeHidden();
  await setAccessibilityPermission(page, false);

  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  await expect(page.getByText(permissionTitle)).toBeVisible();
});

test("ignores an older granted response after a newer denied response", async ({
  page,
}) => {
  await page.goto("/?accessibility=granted");
  await expect(page.getByText(permissionTitle)).toBeHidden();
  await deferNextAccessibilityChecks(page, 2);

  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("focus"));
  });
  await waitForPendingAccessibilityChecks(page, 2);
  await resolveAccessibilityCheck(page, 1, false);
  await expect(page.getByText(permissionTitle)).toBeVisible();

  await resolveAccessibilityCheck(page, 0, true);
  await expect(page.getByText(permissionTitle)).toBeVisible();
});

test("shows a retry state when checking access fails", async ({ page }) => {
  await page.goto(`/?reject=${encodeURIComponent(permissionCheckCommand)}`);

  await expect(
    page.getByText("Couldn’t check Accessibility access")
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("shows an actionable error when access cannot be requested", async ({
  page,
}) => {
  await page.goto(`/?reject=${encodeURIComponent(permissionRequestCommand)}`);
  await expect(page.getByText(permissionTitle)).toBeVisible();

  await page
    .getByRole("button", { name: "Request Accessibility Access" })
    .click();

  await expect(
    page.getByText("Couldn’t request Accessibility access")
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("rejects a malformed native permission response", async ({ page }) => {
  await page.goto("/?accessibility=invalid");

  await expect(
    page.getByText("Couldn’t check Accessibility access")
  ).toBeVisible();
});

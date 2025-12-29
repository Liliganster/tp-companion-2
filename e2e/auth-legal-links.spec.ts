import { test, expect } from "@playwright/test";

test("Auth page shows legal links", async ({ page }) => {
  await page.goto("/auth");

  await expect(page.locator('a[href="/legal/terms"]').first()).toBeVisible();
  await expect(page.locator('a[href="/legal/privacy"]').first()).toBeVisible();
});

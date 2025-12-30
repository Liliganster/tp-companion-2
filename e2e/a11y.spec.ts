import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function expectNoSeriousA11yIssues(page: Page) {
  const results = await new AxeBuilder({ page })
    // Visual/design-heavy rule; we’ll audit it separately with Lighthouse to avoid false negatives in CI.
    .disableRules(["color-contrast"])
    .analyze();

  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");

  expect(
    serious,
    serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes)`).join("\n"),
  ).toEqual([]);
}

test("A11y: auth page", async ({ page }) => {
  await page.goto("/auth");

  await expect(page.locator('a[href="/legal/terms"]').first()).toBeVisible();
  await expectNoSeriousA11yIssues(page);
});

test("A11y: legal pages", async ({ page }) => {
  for (const path of ["/legal/terms", "/legal/privacy", "/legal/cookies"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  }
});

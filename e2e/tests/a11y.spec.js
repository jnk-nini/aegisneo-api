import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { asGuest, signIn } from "./helpers.js";

// Automatic accessibility checks (contrast, names, roles, landmarks). They catch the common
// mistakes; they do not replace trying the site with a keyboard and a screen reader.
async function serious(page) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

test("landing page", async ({ page }) => {
  await page.goto("./");
  await page.waitForTimeout(1200); // let the reveal animations finish
  expect(await serious(page)).toEqual([]);
});

test("sign-in page, in both modes", async ({ page }) => {
  await page.goto("auth");
  await page.waitForTimeout(1000); // the card fades in; check it once it has settled
  expect(await serious(page)).toEqual([]);
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.waitForTimeout(500);
  expect(await serious(page)).toEqual([]);
});

test("hub", async ({ page }) => {
  await signIn(page, "bob");
  await page.waitForTimeout(1200);
  expect(await serious(page)).toEqual([]);
});

test("explorer", async ({ page }) => {
  await asGuest(page);
  await page.goto("explorer");
  await expect(page.locator(".asteroid-card").first()).toBeVisible();
  await page.waitForTimeout(1200);
  expect(await serious(page)).toEqual([]);
});

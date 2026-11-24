import { expect, test } from "@playwright/test";
import { asGuest, hasSideScroll, signIn } from "./helpers.js";

// A phone-sized screen with touch: nothing may scroll sideways, and the main actions must be reachable.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test("landing page fits a phone and the call to action is reachable", async ({ page }) => {
  await page.goto("./");
  expect(await hasSideScroll(page)).toBe(false);
  await page.getByRole("link", { name: /Create a free account/ }).first().scrollIntoViewIfNeeded();
  await expect(page.getByRole("link", { name: /Create a free account/ }).first()).toBeVisible();
});

test("sign-in page fits a phone", async ({ page }) => {
  await page.goto("auth");
  expect(await hasSideScroll(page)).toBe(false);
  await expect(page.locator("#authSubmit")).toBeVisible();
});

test("the hub fits a phone and its three sites can be opened", async ({ page }) => {
  await signIn(page, "bob");
  expect(await hasSideScroll(page)).toBe(false);
  for (const slug of ["aegisneo", "impactor", "neo-atlas"]) await expect(page.locator(`[data-launch="${slug}"]`)).toBeVisible();
});

test("the Explorer fits a phone, and its dialog opens as a sheet that fits", async ({ page }) => {
  await asGuest(page);
  await page.goto("explorer");
  await expect(page.locator(".asteroid-card").first()).toBeVisible();
  expect(await hasSideScroll(page)).toBe(false);
  await page.locator(".detail-btn").first().tap();
  const panel = page.locator(".detail-panel");
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box.width).toBeLessThanOrEqual(390);
  await expect(page.locator(".impactor-btn")).toBeVisible();
});

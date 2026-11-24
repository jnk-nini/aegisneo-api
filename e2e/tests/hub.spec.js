import { expect, test } from "@playwright/test";
import { PASSWORD, asGuest, signIn, stubPartners, watchErrors } from "./helpers.js";

test("a signed-in user sees their access and no sign-up prompt", async ({ page }) => {
  const errors = watchErrors(page);
  await signIn(page, "bob");
  await expect(page.locator("#upsell")).toBeHidden();
  await expect(page.locator(".site-card")).toHaveCount(3);
  await expect(page.locator("#rolePill")).toHaveText("Explorer");
  await expect(page.locator("#adminPanel")).toBeHidden();
  await expect(page.locator(".access").first()).toContainText("Full catalog");
  expect(errors).toEqual([]);
});

test("an admin also sees mission control", async ({ page }) => {
  await signIn(page, "alice");
  await expect(page.locator("#adminPanel")).toBeVisible();
  await expect(page.locator("#adminStats .tile").first()).toBeVisible();
});

test("opening Impactor hands the visitor's ticket over in the address fragment", async ({ page }) => {
  await stubPartners(page);
  await signIn(page, "bob");
  await page.locator('[data-launch="impactor"]').click();
  await page.waitForURL(/aegisneo-impactor\.vercel\.app/);
  expect(page.url()).toMatch(/#aegis_ticket=[\w-]+\.[\w-]+\.[\w-]+$/);
});

test("a guest is sent to a partner site without a ticket", async ({ page }) => {
  await stubPartners(page);
  await asGuest(page);
  await page.locator('[data-launch="neo-atlas"]').click();
  await page.waitForURL(/neo-atlas-pearl\.vercel\.app/);
  expect(page.url()).not.toContain("aegis_ticket");
});

test("opening the Explorer from the hub works and earns the Explorer badge", async ({ page }) => {
  await signIn(page, "bob");
  await page.locator('[data-launch="aegisneo"]').click();
  await page.waitForURL("**/explorer");
  await expect(page.locator(".asteroid-card").first()).toBeVisible();
  await page.goBack();
  await expect(page.locator(".badge:not(.locked) b", { hasText: "Explorer" })).toBeVisible();
});

test("an account without a recovery code is told, and can make one with its password", async ({ page }) => {
  await signIn(page, "bob");
  await expect(page.locator("#recoveryNote")).toBeVisible();
  await page.locator("[data-recovery-open]").first().click();
  await page.fill("#recPassword", "wrong password here");
  await page.click("#recSubmit");
  await expect(page.locator("#recError")).toHaveText("That password is not correct.");
  await page.fill("#recPassword", PASSWORD);
  await page.click("#recSubmit");
  await expect(page.locator("#recCode")).toHaveText(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
  await page.click("#recClose");
  await expect(page.locator("#recoveryNote")).toBeHidden();
  await expect(page.locator("#securityText")).toContainText("recovery code is set");
});

test("the warp stays out of the way when motion is off", async ({ page }) => {
  await stubPartners(page);
  await signIn(page, "bob");
  await page.locator("[data-motion-toggle]").click();
  const started = Date.now();
  await page.locator('[data-launch="impactor"]').click();
  await page.waitForURL(/aegisneo-impactor\.vercel\.app/);
  expect(Date.now() - started).toBeLessThan(4000);
});

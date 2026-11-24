import { expect } from "@playwright/test";

export const PASSWORD = "correct horse battery";

/** Sign in through the real sign-in page and land on the hub. */
export async function signIn(page, user = "bob") {
  await page.goto("auth");
  await page.fill("#username", user);
  await page.fill("#password", PASSWORD);
  await page.click("#authSubmit");
  await page.waitForURL("**/hub");
  await expect(page.locator(".site-card").first()).toBeVisible();
}

/** Continue as a guest and land on the hub. */
export async function asGuest(page) {
  await page.goto("auth");
  await page.click("#guestBtn");
  await page.waitForURL("**/hub");
  await expect(page.locator(".site-card").first()).toBeVisible();
}

/** The partner sites are other websites: answer for them, so a test can look at the address it was sent to. */
export async function stubPartners(page) {
  await page.route(/https:\/\/(aegisneo-impactor|neo-atlas-pearl)\.vercel\.app\/.*/, (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><title>partner site</title>" }),
  );
}

/** Collects page errors and console errors so a test can assert the page was clean. */
export function watchErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

// On a phone the layout can be stretched wider than the screen; compare with the width the visitor actually sees.
export const hasSideScroll = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth > (window.visualViewport?.width ?? window.innerWidth) + 1);

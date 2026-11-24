import { expect, test } from "@playwright/test";
import { PASSWORD, asGuest, signIn, stubPartners, watchErrors } from "./helpers.js";

async function openExplorer(page, user = "bob", path = "explorer") {
  await signIn(page, user);
  await page.goto(path);
  await expect(page.locator(".asteroid-card").first()).toBeVisible();
}

test("the whole catalog is reachable: first page, then Load more", async ({ page }) => {
  const errors = watchErrors(page);
  await openExplorer(page);
  await expect(page.locator(".asteroid-card")).toHaveCount(100);
  await expect(page.locator("#loadMoreCount")).toHaveText("Showing 100 of 33,511 matching asteroids");
  await page.click("#loadMoreBtn");
  await expect(page.locator(".asteroid-card")).toHaveCount(200);
  await expect(page.locator("#loadMoreCount")).toHaveText("Showing 200 of 33,511 matching asteroids");
  expect(errors).toEqual([]);
});

test("sorting by size really finds the largest asteroid in the catalog", async ({ page }) => {
  await openExplorer(page);
  await page.selectOption("#sortSelect", "diameter-desc");
  await expect(page.locator(".card-name").first()).toContainText("Ganymed");
});

test("the hazard and size filters narrow the whole catalog, not just what is on screen", async ({ page }) => {
  await openExplorer(page);
  await page.click('.chip[data-filter="hazard"][data-value="hazard"]');
  await expect(page.locator("#statShown")).not.toHaveText("33,511");
  await expect(page.locator(".asteroid-card.status-safe")).toHaveCount(0);
  await page.click('.chip[data-filter="size"][data-value="small"]');
  await expect(page.locator(".size-badge:not(.size-small)")).toHaveCount(0);
  await expect(page.locator(".asteroid-card").first()).toBeVisible();
});

test("search finds an asteroid by name", async ({ page }) => {
  await openExplorer(page);
  await page.fill("#searchInput", "apophis");
  await page.press("#searchInput", "Enter");
  await expect(page.locator(".asteroid-card")).toHaveCount(1);
  await expect(page.locator(".card-name")).toContainText("Apophis");
});

test("the telemetry dialog is accessible: focus moves in, stays in, and returns", async ({ page }) => {
  await openExplorer(page);
  const opener = page.locator(".detail-btn").first();
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.locator(".detail-close")).toBeFocused();
  for (let i = 0; i < 9; i++) await page.keyboard.press("Tab");
  expect(await page.evaluate(() => Boolean(document.activeElement.closest(".detail-panel")))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test("an open asteroid is in the address bar, and that link opens it again", async ({ page }) => {
  await openExplorer(page);
  await page.fill("#searchInput", "apophis");
  await page.press("#searchInput", "Enter");
  await page.locator(".detail-btn").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("asteroid")).toBe("2099942");
  await page.keyboard.press("Escape");
  expect(new URL(page.url()).searchParams.has("asteroid")).toBe(false);

  await page.goto("explorer?asteroid=2099942");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".detail-name")).toContainText("Apophis");
});

test("Share link copies an address that opens the same asteroid", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openExplorer(page);
  await page.locator(".detail-btn").first().click();
  await page.locator(".share-btn").click();
  await expect(page.locator(".toast-item")).toContainText("Link copied");
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(link).pathname).toMatch(/\/explorer$/);
  expect(new URL(link).searchParams.get("asteroid")).toMatch(/^\d+$/);
});

test("Open in Impactor goes to Impactor with this asteroid and the visitor's ticket", async ({ page }) => {
  await stubPartners(page);
  await openExplorer(page);
  await page.fill("#searchInput", "apophis");
  await page.press("#searchInput", "Enter");
  await page.locator(".detail-btn").first().click();
  await page.locator(".impactor-btn").click();
  await page.waitForURL(/aegisneo-impactor\.vercel\.app/);
  const url = new URL(page.url());
  expect(url.searchParams.get("asteroid")).toBe("2099942");
  expect(url.hash).toMatch(/^#aegis_ticket=/);
});

test("a guest can open Impactor from the Explorer too, without a ticket", async ({ page }) => {
  await stubPartners(page);
  await asGuest(page);
  await page.goto("explorer?asteroid=2099942");
  await page.locator(".impactor-btn").click();
  await page.waitForURL(/aegisneo-impactor\.vercel\.app/);
  expect(page.url()).toContain("asteroid=2099942");
  expect(page.url()).not.toContain("aegis_ticket");
});

test("a guest sees only the featured asteroids, and a shared link to another one asks them to sign in", async ({ page }) => {
  await asGuest(page);
  await page.goto("explorer");
  await expect(page.locator(".asteroid-card")).toHaveCount(10);
  await expect(page.locator("#guestBanner")).toBeVisible();
  await page.goto("explorer?asteroid=3599866");
  await expect(page.locator(".toast-item")).toContainText("Log in");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("My List keeps stars and the Cosmic Guesser still plays with a narrow search", async ({ page }) => {
  await openExplorer(page);
  await page.locator(".fav-btn").first().click();
  await expect(page.locator("#watchlistToggle")).toContainText("(1)");
  await page.fill("#searchInput", "apophis");
  await page.press("#searchInput", "Enter");
  await expect(page.locator(".asteroid-card")).toHaveCount(1);
  await expect(page.locator(".game-pick")).toHaveCount(2); // the game has its own pool
  await page.locator(".game-pick").first().click();
  await expect(page.locator("#gameFeedback")).not.toHaveText("");
});

test("an admin can add and remove an asteroid", async ({ page }) => {
  await openExplorer(page, "alice");
  await page.click("#newBtn");
  await expect(page.locator('[name="neo_reference_id"]')).toBeFocused();
  const fields = { neo_reference_id: "9100777", name: "E2E Test Rock", estimated_diameter_km: "0.2", close_approach_date: "2026-05-01", relative_velocity_km_h: "50000", miss_distance_km: "3000000", absolute_magnitude: "22" };
  for (const [name, value] of Object.entries(fields)) await page.fill(`[name="${name}"]`, value);
  await page.click('#editorForm [type="submit"]');
  await expect(page.locator(".toast-item")).toContainText("Asteroid created");
  await page.fill("#searchInput", "E2E Test Rock");
  await page.press("#searchInput", "Enter");
  await expect(page.locator(".asteroid-card")).toHaveCount(1);
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".del-btn").click();
  await expect(page.locator(".asteroid-card")).toHaveCount(0);
});

test("a regular user never sees the admin controls", async ({ page }) => {
  await openExplorer(page, "bob");
  await expect(page.locator("#newBtn")).toBeHidden();
  await expect(page.locator(".edit-btn")).toHaveCount(0);
});

test("the Explorer survives blocked browser storage", async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("blocked", "SecurityError"); } });
  });
  const page = await context.newPage();
  const errors = watchErrors(page);
  await asGuest(page);
  await page.goto("explorer");
  await expect(page.locator(".asteroid-card").first()).toBeVisible();
  expect(errors.filter((e) => e.startsWith("pageerror"))).toEqual([]);
  await context.close();
});

test("a failed load shows a retry button that recovers", async ({ page }) => {
  await openExplorer(page);
  await page.route("**/api/v1/asteroids?*", (route) => route.abort());
  await page.click("#resetBtn");
  await expect(page.locator(".retry-btn")).toBeVisible();
  await page.unroute("**/api/v1/asteroids?*");
  await page.click(".retry-btn");
  await expect(page.locator(".asteroid-card").first()).toBeVisible();
});

test.skip(({ browserName }) => browserName !== "chromium", "Chromium only");
void PASSWORD;

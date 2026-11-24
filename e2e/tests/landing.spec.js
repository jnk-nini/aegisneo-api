import { expect, test } from "@playwright/test";
import { watchErrors } from "./helpers.js";

test("the landing page shows the hero, the live catalog size and the sign-up link", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("The sky is full of rocks");
  await expect(page.locator("#heroCount")).toHaveText("33,511");
  await expect(page.getByRole("link", { name: /Create a free account/ }).first()).toHaveAttribute("href", /auth\?mode=signup/);
  await expect(page.locator("#heroGlobe")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the Motion switch turns animation off and is remembered", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "on");
  await page.locator("[data-motion-toggle]").click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await expect(page.locator("[data-motion-toggle]")).toHaveAttribute("aria-pressed", "true");
});

test("a visitor who asks for reduced motion gets none by default", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:8123/frontend/");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible(); // content is never hidden waiting for an animation
  await context.close();
});

test("the old /frontend address is not needed: pages open by clean names", async ({ page }) => {
  for (const [name, heading] of [["auth", /Welcome back/], ["hub", null]]) {
    const response = await page.goto(name);
    expect(response.status()).toBe(200);
    if (heading) await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText(heading);
  }
});

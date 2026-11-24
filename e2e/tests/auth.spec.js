import { expect, test } from "@playwright/test";
import { PASSWORD, asGuest, signIn, watchErrors } from "./helpers.js";

test("signing in asks for a username and password only", async ({ page }) => {
  await page.goto("auth");
  await expect(page.locator("#confirmField")).toBeHidden();
  await expect(page.locator("#strength")).toBeHidden();
  await page.getByRole("tab", { name: "Create account" }).click();
  await expect(page.locator("#confirmField")).toBeVisible();
  await page.getByRole("tab", { name: "Sign in" }).click();
  await expect(page.locator("#confirmField")).toBeHidden();
});

test("the arrow keys move between the sign-in and create-account tabs", async ({ page }) => {
  await page.goto("auth");
  await page.locator("#tabLogin").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#tabSignup")).toHaveAttribute("aria-selected", "true");
});

test("a wrong password gets a plain message", async ({ page }) => {
  await page.goto("auth");
  await page.fill("#username", "bob");
  await page.fill("#password", "not the password");
  await page.click("#authSubmit");
  await expect(page.locator("#authError")).toHaveText("Incorrect username or password.");
});

test("a mismatched confirmation is caught before anything is sent", async ({ page }) => {
  await page.goto("auth?mode=signup");
  await page.fill("#username", "dana");
  await page.fill("#password", "a long enough password");
  await page.fill("#confirm", "something else entirely");
  await page.click("#authSubmit");
  await expect(page.locator("#authError")).toHaveText("The two passwords do not match.");
});

test("a new account must save its recovery code before continuing", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("auth?mode=signup");
  await page.fill("#username", "erin_new");
  await page.fill("#password", PASSWORD);
  await page.fill("#confirm", PASSWORD);
  await page.click("#authSubmit");
  await expect(page.locator("#codePanel")).toBeVisible();
  await expect(page.locator("#codeValue")).toHaveText(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
  await expect(page.locator("#codeContinue")).toBeDisabled();
  await page.check("#codeSaved");
  await page.click("#codeContinue");
  await page.waitForURL("**/hub");
  await expect(page.locator("#who")).toHaveText("@erin_new");
  expect(errors).toEqual([]);
});

test("a forgotten password is reset with the recovery code, and the code is used up", async ({ page }) => {
  await page.goto("auth?mode=signup");
  await page.fill("#username", "frank_reset");
  await page.fill("#password", PASSWORD);
  await page.fill("#confirm", PASSWORD);
  await page.click("#authSubmit");
  await expect(page.locator("#codeValue")).toHaveText(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
  const code = (await page.locator("#codeValue").textContent()).trim();
  await page.check("#codeSaved");
  await page.click("#codeContinue");
  await page.waitForURL("**/hub");
  await page.click("#logoutBtn");
  await page.waitForURL(/\/frontend\/?$/);

  await page.goto("auth");
  await page.click("#forgotBtn");
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await page.fill("#resetUser", "frank_reset");
  await page.fill("#resetCode", "AAAA-BBBB-CCCC-DDDD");
  await page.fill("#resetPass", "my brand new password");
  await page.fill("#resetConfirm", "my brand new password");
  await page.click("#resetSubmit");
  await expect(page.locator("#resetError")).toHaveText("The username or recovery code is not correct.");

  await page.fill("#resetCode", code.toLowerCase());
  await page.click("#resetSubmit");
  await expect(page.locator("#codePanel")).toBeVisible();
  await expect(page.locator("#codeValue")).toHaveText(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
  const newCode = (await page.locator("#codeValue").textContent()).trim();
  expect(newCode).not.toBe(code);
  await page.check("#codeSaved");
  await page.click("#codeContinue");

  await page.fill("#username", "frank_reset");
  await page.fill("#password", "my brand new password");
  await page.click("#authSubmit");
  await page.waitForURL("**/hub");
  await expect(page.locator("#who")).toHaveText("@frank_reset");
});

test("a guest gets to the hub and is invited to create an account", async ({ page }) => {
  await asGuest(page);
  await expect(page.locator("#upsell")).toBeVisible();
  await expect(page.locator("#rolePill")).toHaveText("Guest");
});

test("signing in sends a returning visitor straight to the hub", async ({ page }) => {
  await signIn(page, "bob");
  await page.goto("auth");
  await page.waitForURL("**/hub");
});

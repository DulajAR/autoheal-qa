import { test, expect } from "@playwright/test";

test.describe("SauceDemo External Integration", () => {
  test("EXT-001: login page loads", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#user-name")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator("#login-button")).toBeVisible();
  });

  test("EXT-002: standard user can log in", async ({ page }) => {
    await page.goto("/");

    await page.locator("#user-name").fill("standard_user");
    await page.locator("#password").fill("secret_sauce");

    await page.locator("#login-button").click();

    await expect(page).toHaveURL(/inventory\.html/);
    await expect(page.locator(".inventory_list")).toBeVisible();
    await expect(page.locator(".inventory_item").first()).toBeVisible();
  });

  test("EXT-003: invalid credentials are rejected", async ({ page }) => {
    await page.goto("/");

    await page.locator("#user-name").fill("invalid_user");
    await page.locator("#password").fill("wrong_password");

    await page.locator("#login-button").click();

    await expect(
      page.locator('[data-test="error"]')
    ).toBeVisible();

    await expect(page).not.toHaveURL(/inventory\.html/);
  });

  test("EXT-004: locked-out user cannot log in", async ({ page }) => {
    await page.goto("/");

    await page.locator("#user-name").fill("locked_out_user");
    await page.locator("#password").fill("secret_sauce");

    await page.locator("#login-button").click();

    await expect(
      page.locator('[data-test="error"]')
    ).toContainText("locked out");
  });
});
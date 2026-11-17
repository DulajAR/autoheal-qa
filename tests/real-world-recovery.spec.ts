
import { test, expect } from "@playwright/test";

const demoUrl = "http://localhost:4173";

test.describe("Real-World Recovery Demo", () => {
  test("RWR-001: original login selector works", async ({ page }) => {
    await page.goto(demoUrl);

    await page.locator("#username").fill("demo");
    await page.locator("#password").fill("demo123");

    await page.locator("#login-button").click();

    await expect(page.getByRole("status")).toHaveText(
      "Login successful"
    );
  });

  test("RWR-002: changed UI removes original selector", async ({ page }) => {
    await page.goto(demoUrl);

    await page.locator("#version").selectOption("b");

    await expect(page.locator("#login-button")).toHaveCount(0);

    await expect(
      page.locator('[data-testid="sign-in"]')
    ).toBeVisible();
  });

  test("RWR-003: changed UI remains functional", async ({ page }) => {
    await page.goto(demoUrl);

    await page.locator("#version").selectOption("b");

    await page.locator("#username").fill("demo");
    await page.locator("#password").fill("demo123");

    await page.locator('[data-testid="sign-in"]').click();

    await expect(page.getByRole("status")).toHaveText(
      "Login successful"
    );
  });
});

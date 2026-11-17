
import { test, expect } from "@playwright/test";

import { SelfHealingLocator } from "../src/core/SelfHealingLocator";
import { MockAIProvider } from "../src/ai/MockAIProvider";

const demoUrl = "http://localhost:4173";

test.describe("Real-World Recovery Demo", () => {
  /**
   * RWR-001
   * Verify that the original login selector works.
   */
  test(
    "RWR-001: original login selector works",
    async ({ page }) => {
      await page.goto(demoUrl);

      await page.locator("#username").fill("demo");
      await page.locator("#password").fill("demo123");

      await page.locator("#login-button").click();

      await expect(
        page.getByRole("status")
      ).toHaveText("Login successful");
    }
  );

  /**
   * RWR-002
   * Verify that Version B removes the original
   * login selector and introduces a new one.
   */
  test(
    "RWR-002: changed UI removes original selector",
    async ({ page }) => {
      await page.goto(demoUrl);

      await page.locator("#version").selectOption("b");

      await expect(
        page.locator("#login-button")
      ).toHaveCount(0);

      await expect(
        page.locator('[data-testid="sign-in"]')
      ).toBeVisible();
    }
  );

  /**
   * RWR-003
   * Verify that the updated login interface
   * continues to function correctly.
   */
  test(
    "RWR-003: changed UI remains functional",
    async ({ page }) => {
      await page.goto(demoUrl);

      await page.locator("#version").selectOption("b");

      await page.locator("#username").fill("demo");
      await page.locator("#password").fill("demo123");

      await page.locator(
        '[data-testid="sign-in"]'
      ).click();

      await expect(
        page.getByRole("status")
      ).toHaveText("Login successful");
    }
  );

  /**
   * RWR-004
   * Verify that AutoHeal-QA can recover a
   * broken primary locator using a trusted
   * deterministic fallback.
   */
  test(
    "RWR-004: trusted fallback recovers changed UI",
    async ({ page }) => {
      await page.goto(demoUrl);

      await page.locator("#version").selectOption("b");

      const healing = new SelfHealingLocator(page);

      const button = await healing.resolve(
        "#login-button",
        [
          {
            name: "trusted sign-in fallback",
            selector: '[data-testid="sign-in"]',
            confidence: 0.95,
          },
        ],
        {
          enabled: true,
          timeoutMs: 500,
          minimumConfidence: 0.85,
        }
      );

      await expect(button).toBeVisible();
      await expect(button).toHaveText("Continue");

      // Confirm the recovered locator can
      // interact with the updated interface.
      await page.locator("#username").fill("demo");
      await page.locator("#password").fill("demo123");

      await button.click();

      await expect(
        page.getByRole("status")
      ).toHaveText("Login successful");
    }
  );

  /**
   * RWR-005
   * Verify that AI recovery can suggest a valid
   * replacement without automatically executing
   * the AI-generated locator.
   *
   * Uses MockAIProvider to avoid external
   * API requests during regression testing.
   */
  test(
    "RWR-005: AI suggestion remains advisory",
    async ({ page }, testInfo) => {
      await page.goto(demoUrl);

      await page.locator("#version").selectOption("b");

      const provider = new MockAIProvider([
        {
          selector: '[data-testid="sign-in"]',
          confidence: 0.95,
        },
      ]);

      const healing = new SelfHealingLocator(
        page,
        provider
      );

      // AI recovery should evaluate the candidate,
      // but must not execute it automatically.
      await expect(
        healing.resolve(
          "#login-button",
          [],
          {
            enabled: true,
            timeoutMs: 500,
            aiRecovery: {
              enabled: true,
              minimumConfidence: 0.85,
            },
          }
        )
      ).rejects.toThrow(
        "Self-healing failed for locator: #login-button"
      );

      // Verify the recovery audit attachment.
      const attachment = testInfo.attachments.find(
        (item) =>
          item.name === "autoheal-ai-recovery-event"
      );

      expect(attachment).toBeDefined();
      expect(attachment?.body).toBeDefined();

      const event = JSON.parse(
        attachment!.body!.toString("utf8")
      );

      expect(event.event).toBe(
        "AI_RECOVERY_EVALUATED"
      );

      expect(event.status).toBe("SUGGESTED");
      expect(event.provider).toBe("mock");
      expect(event.confidence).toBe(0.95);

      // Audit attachments must not expose
      // sensitive selector information.
      expect(event).not.toHaveProperty(
        "suggestedSelector"
      );

      expect(event).not.toHaveProperty(
        "primarySelector"
      );

      // Verify that the AI suggestion did not
      // automatically submit the login form.
      await expect(
        page.getByRole("status")
      ).toBeEmpty();
    }
  );
});

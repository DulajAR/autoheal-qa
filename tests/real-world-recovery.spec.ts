
import { test, expect } from "@playwright/test";

import { SelfHealingLocator } from "../src/core/SelfHealingLocator";
import { MockAIProvider } from "../src/ai/MockAIProvider";

const demoUrl = "http://localhost:4173";

test.describe("Real-World Recovery Demo", () => {
  /**
   * RWR-001
   * Verify the original login selector works.
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
   * Verify Version B removes the original selector.
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
   * Verify Version B remains functional.
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
   * Verify recovery using a trusted fallback.
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
   * AI suggestions must remain advisory-only.
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

      expect(event).not.toHaveProperty(
        "suggestedSelector"
      );

      expect(event).not.toHaveProperty(
        "primarySelector"
      );

      await expect(
        page.getByRole("status")
      ).toBeEmpty();
    }
  );

  /**
   * RWR-006
   * Reject a fallback below the confidence threshold.
   */
  test(
    "RWR-006: rejects low-confidence fallback",
    async ({ page }) => {
      await page.goto(demoUrl);

      await page.locator("#version").selectOption("b");

      const healing = new SelfHealingLocator(page);

      await expect(
        healing.resolve(
          "#login-button",
          [
            {
              name: "low-confidence fallback",
              selector: '[data-testid="sign-in"]',
              confidence: 0.5,
            },
          ],
          {
            enabled: true,
            timeoutMs: 300,
            minimumConfidence: 0.85,
          }
        )
      ).rejects.toThrow("Self-healing failed");

      await expect(
        page.getByRole("status")
      ).toBeEmpty();
    }
  );

  /**
   * RWR-007
   * Reject ambiguous fallback selectors.
   */
  test(
    "RWR-007: rejects ambiguous fallback",
    async ({ page }) => {
      await page.goto(demoUrl);

      await page.locator("#version").selectOption("b");

      await page.evaluate(() => {
        const duplicate = document.createElement(
          "button"
        );

        duplicate.type = "button";

        duplicate.setAttribute(
          "data-testid",
          "sign-in"
        );

        duplicate.textContent = "Duplicate";

        document.body.appendChild(duplicate);
      });

      const healing = new SelfHealingLocator(page);

      await expect(
        healing.resolve(
          "#login-button",
          [
            {
              name: "ambiguous fallback",
              selector: '[data-testid="sign-in"]',
              confidence: 0.95,
            },
          ],
          {
            enabled: true,
            timeoutMs: 300,
          }
        )
      ).rejects.toThrow("Self-healing failed");

      await expect(
        page.locator('[data-testid="sign-in"]')
      ).toHaveCount(2);

      await expect(
        page.getByRole("status")
      ).toBeEmpty();
    }
  );

  /**
   * RWR-008
   * Provider failures must be handled safely.
   */
  test(
    "RWR-008: handles AI provider failure",
    async ({ page }, testInfo) => {
      await page.goto(demoUrl);

      await page.locator("#version").selectOption("b");

      const failingProvider = {
        name: "mock",

        async suggestLocators() {
          throw new Error(
            "Simulated provider failure"
          );
        },
      };

      const healing = new SelfHealingLocator(
        page,
        failingProvider
      );

      await expect(
        healing.resolve(
          "#login-button",
          [],
          {
            enabled: true,
            timeoutMs: 300,
            aiRecovery: {
              enabled: true,
            },
          }
        )
      ).rejects.toThrow("Self-healing failed");

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

      expect(event.status).toBe("FAILED");

      expect(event.reason).toBe(
        "RECOVERY_PIPELINE_FAILED"
      );

      await expect(
        page.getByRole("status")
      ).toBeEmpty();
    }
  );

  /**
   * RWR-009
   * Verify timeout enforcement for a slow provider.
   */
  test(
    "RWR-009: handles AI provider timeout",
    async ({ page }, testInfo) => {
      await page.goto(demoUrl);

      await page.locator("#version").selectOption("b");

      const slowProvider = {
        name: "mock",

        async suggestLocators(): Promise<never> {
          return new Promise<never>(() => {});
        },
      };

      const healing = new SelfHealingLocator(
        page,
        slowProvider
      );

      await expect(
        healing.resolve(
          "#login-button",
          [],
          {
            enabled: true,
            timeoutMs: 300,
            aiRecovery: {
              enabled: true,
              providerTimeoutMs: 100,
              validationTimeoutMs: 500,
            },
          }
        )
      ).rejects.toThrow("Self-healing failed");

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

      expect(event.status).toBe("FAILED");

      await expect(
        page.getByRole("status")
      ).toBeEmpty();
    }
  );

  /**
   * RWR-010
   * Verify an already-aborted recovery is rejected.
   */
  test(
    "RWR-010: handles AI recovery cancellation",
    async ({ page }, testInfo) => {
      await page.goto(demoUrl);

      await page.locator("#version").selectOption("b");

      const controller = new AbortController();

      controller.abort();

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

      await expect(
        healing.resolve(
          "#login-button",
          [],
          {
            enabled: true,
            timeoutMs: 300,
            aiRecovery: {
              enabled: true,
              signal: controller.signal,
            },
          }
        )
      ).rejects.toThrow("Self-healing failed");

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

      expect(event.status).toBe("FAILED");

      expect(event.reason).toBe(
        "RECOVERY_CANCELLED"
      );

      await expect(
        page.getByRole("status")
      ).toBeEmpty();
    }
  );
});

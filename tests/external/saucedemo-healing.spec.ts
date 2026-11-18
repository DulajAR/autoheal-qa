
import { test, expect } from "@playwright/test";

import {
  SelfHealingLocator,
} from "../../src/core/SelfHealingLocator";

import {
  MockAIProvider,
} from "../../src/ai/MockAIProvider";

test.describe("SauceDemo Self-Healing Integration", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(
      page.locator("#login-button")
    ).toBeVisible();
  });

  test(
    "EXT-005: valid primary selector takes priority",
    async ({ page }) => {
      const healing = new SelfHealingLocator(page);

      const locator = await healing.resolve(
        "#login-button",
        [
          {
            name: "trusted fallback",
            selector: '[data-test="login-button"]',
            confidence: 0.95,
          },
        ],
        {
          enabled: true,
          timeoutMs: 1000,
        }
      );

      await expect(locator).toBeVisible();
      await expect(locator).toHaveAttribute(
        "id",
        "login-button"
      );
    }
  );

  test(
    "EXT-006: trusted fallback recovers broken selector",
    async ({ page }, testInfo) => {
      const healing = new SelfHealingLocator(page);

      const locator = await healing.resolve(
        "#outdated-login-button",
        [
          {
            name: "trusted login fallback",
            selector: "#login-button",
            confidence: 0.95,
          },
        ],
        {
          enabled: true,
          timeoutMs: 300,
          minimumConfidence: 0.85,
        }
      );

      await expect(locator).toBeVisible();

      const attachment = testInfo.attachments.find(
        (item) => item.name === "autoheal-healing-event"
      );

      expect(attachment?.body).toBeDefined();

      const audit = JSON.parse(
        attachment!.body!.toString("utf8")
      );

      expect(audit.event).toBe("LOCATOR_HEALED");
      expect(audit.strategy).toBe(
        "trusted login fallback"
      );
      expect(audit.confidence).toBe(0.95);

      await page.locator("#user-name").fill(
        "standard_user"
      );
      await page.locator("#password").fill(
        "secret_sauce"
      );

      await locator.click();

      await expect(page).toHaveURL(
        /inventory\.html/
      );
    }
  );

  test(
    "EXT-007: low-confidence fallback is rejected",
    async ({ page }) => {
      const healing = new SelfHealingLocator(page);

      await expect(
        healing.resolve(
          "#outdated-login-button",
          [
            {
              name: "untrusted fallback",
              selector: "#login-button",
              confidence: 0.40,
            },
          ],
          {
            enabled: true,
            timeoutMs: 300,
            minimumConfidence: 0.85,
          }
        )
      ).rejects.toThrow("Self-healing failed");

      await expect(page).not.toHaveURL(
        /inventory\.html/
      );
    }
  );

  test(
    "EXT-008: ambiguous fallback is rejected",
    async ({ page }) => {
      const healing = new SelfHealingLocator(page);

      await expect(
        healing.resolve(
          "#outdated-login-button",
          [
            {
              name: "ambiguous input fallback",
              selector: "input",
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
        page.locator("input")
      ).not.toHaveCount(1);
    }
  );

  test(
    "EXT-009: AI suggestion remains advisory",
    async ({ page }, testInfo) => {
      const provider = new MockAIProvider([
        {
          selector: "#login-button",
          confidence: 0.95,
        },
      ]);

      const healing = new SelfHealingLocator(
        page,
        provider
      );

      await expect(
        healing.resolve(
          "#outdated-login-button",
          [],
          {
            enabled: true,
            timeoutMs: 300,
            aiRecovery: {
              enabled: true,
              minimumConfidence: 0.85,
            },
          }
        )
      ).rejects.toThrow("Self-healing failed");

      const attachment = testInfo.attachments.find(
        (item) =>
          item.name === "autoheal-ai-recovery-event"
      );

      expect(attachment?.body).toBeDefined();

      const audit = JSON.parse(
        attachment!.body!.toString("utf8")
      );

      expect(audit.event).toBe(
        "AI_RECOVERY_EVALUATED"
      );
      expect(audit.status).toBe("SUGGESTED");
      expect(audit.provider).toBe("mock");

      await expect(page).not.toHaveURL(
        /inventory\.html/
      );
    }
  );

  test(
    "EXT-010: healing audit records correct metadata",
    async ({ page }, testInfo) => {
      const healing = new SelfHealingLocator(page);

      const locator = await healing.resolve(
        "#missing-login-button",
        [
          {
            name: "external-app-fallback",
            selector: "#login-button",
            confidence: 0.98,
          },
        ],
        {
          enabled: true,
          timeoutMs: 300,
          minimumConfidence: 0.85,
        }
      );

      await expect(locator).toBeVisible();

      const attachments = testInfo.attachments.filter(
        (item) =>
          item.name === "autoheal-healing-event"
      );

      expect(attachments).toHaveLength(1);
      expect(attachments[0].body).toBeDefined();

      const audit = JSON.parse(
        attachments[0].body!.toString("utf8")
      );

      expect(audit).toMatchObject({
        event: "LOCATOR_HEALED",
        primarySelector: "#missing-login-button",
        recoveredSelector: "#login-button",
        strategy: "external-app-fallback",
        confidence: 0.98,
      });

      expect(
        Number.isNaN(Date.parse(audit.timestamp))
      ).toBe(false);
    }
  );
});


import {
  test,
  expect,
  type Page,
} from "@playwright/test";

import { SelfHealingLocator } from "../../src/core/SelfHealingLocator";
import { MockAIProvider } from "../../src/ai/MockAIProvider";

async function setupPage(page: Page): Promise<void> {
  await page.route(
    "http://autoheal.test/",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `
          <!doctype html>
          <html>
            <head>
              <title>AutoHeal Integration Test</title>
            </head>
            <body>
              <button
                id="current-button"
                data-testid="submit"
              >
                Submit
              </button>
            </body>
          </html>
        `,
      });
    }
  );

  await page.goto("http://autoheal.test/");
}

function createMockProvider() {
  return new MockAIProvider([
    {
      selector: "#current-button",
      confidence: 0.95,
    },
  ]);
}

test.describe("Phase 3.6 - AI Recovery Integration", () => {
  test(
    "INT-001 @regression Primary locator has priority",
    async ({ page }, testInfo) => {
      await setupPage(page);

      const healing = new SelfHealingLocator(
        page,
        createMockProvider()
      );

      const locator = await healing.resolve(
        "#current-button",
        [],
        {
          enabled: true,
          aiRecovery: {
            enabled: true,
          },
        }
      );

      await expect(locator).toBeVisible();

      const aiEvents = testInfo.attachments.filter(
        (attachment) =>
          attachment.name ===
          "autoheal-ai-recovery-event"
      );

      expect(aiEvents).toHaveLength(0);
    }
  );

  test(
    "INT-002 @regression Trusted fallback has priority",
    async ({ page }, testInfo) => {
      await setupPage(page);

      const healing = new SelfHealingLocator(
        page,
        createMockProvider()
      );

      const locator = await healing.resolve(
        "#old-button",
        [
          {
            name: "data-testid fallback",
            selector: '[data-testid="submit"]',
            confidence: 0.95,
          },
        ],
        {
          enabled: true,
          timeoutMs: 1000,
          aiRecovery: {
            enabled: true,
          },
        }
      );

      await expect(locator).toBeVisible();

      const aiEvents = testInfo.attachments.filter(
        (attachment) =>
          attachment.name ===
          "autoheal-ai-recovery-event"
      );

      expect(aiEvents).toHaveLength(0);
    }
  );

  test(
    "INT-003 @regression AI suggestions are advisory",
    async ({ page }, testInfo) => {
      await setupPage(page);

      const healing = new SelfHealingLocator(
        page,
        createMockProvider()
      );

      await expect(
        healing.resolve(
          "#old-button",
          [],
          {
            enabled: true,
            timeoutMs: 100,
            aiRecovery: {
              enabled: true,
            },
          }
        )
      ).rejects.toThrow(
        "Self-healing failed for locator: #old-button"
      );

      const attachment = testInfo.attachments.find(
        (item) =>
          item.name ===
          "autoheal-ai-recovery-event"
      );

      expect(attachment).toBeDefined();

      const event = JSON.parse(
        attachment!.body!.toString("utf8")
      );

      expect(event.event).toBe(
        "AI_RECOVERY_EVALUATED"
      );

      expect(event.status).toBe("SUGGESTED");
      expect(event.confidence).toBe(0.95);

      expect(event).not.toHaveProperty(
        "suggestedSelector"
      );

      expect(event).not.toHaveProperty(
        "primarySelector"
      );
    }
  );

  test(
    "INT-004 @regression AI recovery disabled by default",
    async ({ page }, testInfo) => {
      await setupPage(page);

      const healing = new SelfHealingLocator(
        page,
        createMockProvider()
      );

      await expect(
        healing.resolve(
          "#missing-button",
          [],
          {
            enabled: true,
            timeoutMs: 100,
          }
        )
      ).rejects.toThrow(
        "Self-healing failed for locator"
      );

      const aiEvents = testInfo.attachments.filter(
        (item) =>
          item.name ===
          "autoheal-ai-recovery-event"
      );

      expect(aiEvents).toHaveLength(0);
    }
  );

  test(
    "INT-005 @regression Provider failure is controlled",
    async ({ page }, testInfo) => {
      await setupPage(page);

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
          "#missing-button",
          [],
          {
            enabled: true,
            timeoutMs: 100,
            aiRecovery: {
              enabled: true,
            },
          }
        )
      ).rejects.toThrow(
        "Self-healing failed for locator"
      );

      const attachment = testInfo.attachments.find(
        (item) =>
          item.name ===
          "autoheal-ai-recovery-event"
      );

      expect(attachment).toBeDefined();

      const event = JSON.parse(
        attachment!.body!.toString("utf8")
      );

      expect(event.status).toBe("FAILED");
      expect(event.reason).toBe(
        "RECOVERY_PIPELINE_FAILED"
      );
    }
  );

  test(
    "INT-006 @regression Disabled healing blocks AI",
    async ({ page }, testInfo) => {
      await setupPage(page);

      const healing = new SelfHealingLocator(
        page,
        createMockProvider()
      );

      await expect(
        healing.resolve(
          "#missing-button",
          [],
          {
            enabled: false,
            timeoutMs: 100,
            aiRecovery: {
              enabled: true,
            },
          }
        )
      ).rejects.toThrow(
        "self-healing disabled"
      );

      const aiEvents = testInfo.attachments.filter(
        (item) =>
          item.name ===
          "autoheal-ai-recovery-event"
      );

      expect(aiEvents).toHaveLength(0);
    }
  );
});

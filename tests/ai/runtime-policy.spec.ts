
import {
  test,
  expect,
  type Page,
} from "@playwright/test";

import {
  createSelfHealingRuntime,
} from "../../src/core/SelfHealingLocatorFactory";

import type {
  ProductionAIConfig,
} from "../../src/ai/ProductionAIConfig";

const productionConfig: ProductionAIConfig = {
  apiKey: "test-key-not-real",
  model: "test-model",
  timeoutMs: 1000,
  maxOutputTokens: 300,
};

function env(
  overrides: Record<string, string> = {}
): NodeJS.ProcessEnv {
  return {
    TEST_ENV: "development",
    AI_PROVIDER: "openai",
    AI_RECOVERY_ENABLED: "true",
    AI_ALLOW_EXTERNAL_REQUESTS: "true",
    ...overrides,
  };
}

function response(): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              candidates: [
                {
                  selector: "#new-submit",
                  confidence: 0.99,
                },
              ],
            }),
          },
        },
      ],
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}

async function setupPage(page: Page) {
  await page.route(
    "http://autoheal.test/",
    async route => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `
          <html>
            <body>
              <button
                id="new-submit"
                data-testid="submit"
                onclick="window.clicked = true"
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

test.describe("Runtime Policy Enforcement", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test(
    "POL-001: runtime-disabled AI cannot be re-enabled",
    async ({ page }) => {
      let calls = 0;

      const { locator } = createSelfHealingRuntime(
        page,
        env({
          AI_RECOVERY_ENABLED: "false",
        }),
        {
          productionConfig,
          fetchImpl: async () => {
            calls++;
            return response();
          },
        }
      );

      await expect(
        locator.resolve("#old-submit", [], {
          enabled: true,
          timeoutMs: 100,
          aiRecovery: {
            enabled: true,
          },
        })
      ).rejects.toThrow(
        "Self-healing failed for locator"
      );

      expect(calls).toBe(0);
    }
  );

  test(
    "POL-002: caller can opt out of authorized AI",
    async ({ page }) => {
      let calls = 0;

      const { locator } = createSelfHealingRuntime(
        page,
        env(),
        {
          productionConfig,
          fetchImpl: async () => {
            calls++;
            return response();
          },
        }
      );

      await expect(
        locator.resolve("#old-submit", [], {
          enabled: true,
          timeoutMs: 100,
          aiRecovery: {
            enabled: false,
          },
        })
      ).rejects.toThrow(
        "Self-healing failed for locator"
      );

      expect(calls).toBe(0);
    }
  );

  test(
    "POL-003: authorized AI remains advisory",
    async ({ page }, testInfo) => {
      let calls = 0;

      const { locator } = createSelfHealingRuntime(
        page,
        env(),
        {
          productionConfig,
          fetchImpl: async () => {
            calls++;
            return response();
          },
        }
      );

      await expect(
        locator.resolve("#old-submit", [], {
          enabled: true,
          timeoutMs: 100,
          aiRecovery: {
            enabled: true,
          },
        })
      ).rejects.toThrow(
        "Self-healing failed for locator"
      );

      expect(calls).toBe(1);

      expect(
        await page.evaluate(
          () => (window as any).clicked === true
        )
      ).toBe(false);

      const attachment = testInfo.attachments.find(
        item =>
          item.name ===
          "autoheal-ai-recovery-event"
      );

      expect(attachment).toBeDefined();

      const audit = JSON.parse(
        attachment!.body!.toString("utf8")
      );

      expect(audit.status).toBe("SUGGESTED");
      expect(audit.provider).toBe("openai");
      expect(audit).not.toHaveProperty(
        "suggestedSelector"
      );
    }
  );

  test(
    "POL-004: primary selector avoids AI",
    async ({ page }) => {
      let calls = 0;

      const { locator } = createSelfHealingRuntime(
        page,
        env(),
        {
          productionConfig,
          fetchImpl: async () => {
            calls++;
            return response();
          },
        }
      );

      const result = await locator.resolve(
        "#new-submit",
        [],
        {
          enabled: true,
          aiRecovery: {
            enabled: true,
          },
        }
      );

      await expect(result).toBeVisible();
      expect(calls).toBe(0);
    }
  );

  test(
    "POL-005: trusted fallback avoids AI",
    async ({ page }) => {
      let calls = 0;

      const { locator } = createSelfHealingRuntime(
        page,
        env(),
        {
          productionConfig,
          fetchImpl: async () => {
            calls++;
            return response();
          },
        }
      );

      const result = await locator.resolve(
        "#old-submit",
        [
          {
            name: "trusted-test-id",
            selector: '[data-testid="submit"]',
            confidence: 0.95,
          },
        ],
        {
          enabled: true,
          timeoutMs: 100,
          aiRecovery: {
            enabled: true,
          },
        }
      );

      await expect(result).toBeVisible();
      expect(calls).toBe(0);
    }
  );
});

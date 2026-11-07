
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

function testEnvironment(
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

function mockResponse(): Response {
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

async function setupPage(page: Page): Promise<void> {
  await page.route(
    "http://autoheal.test/",
    async route => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `
          <!DOCTYPE html>
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

test.describe(
  "Production Self-Healing End-to-End",
  () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test(
      "E2E-001: primary locator avoids AI",
      async ({ page }) => {
        let fetchCalls = 0;

        const { locator } = createSelfHealingRuntime(
          page,
          testEnvironment(),
          {
            productionConfig,
            fetchImpl: async () => {
              fetchCalls++;
              return mockResponse();
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
        expect(fetchCalls).toBe(0);
      }
    );

    test(
      "E2E-002: deterministic fallback avoids AI",
      async ({ page }) => {
        let fetchCalls = 0;

        const { locator } = createSelfHealingRuntime(
          page,
          testEnvironment(),
          {
            productionConfig,
            fetchImpl: async () => {
              fetchCalls++;
              return mockResponse();
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
        expect(fetchCalls).toBe(0);
      }
    );

    test(
      "E2E-003: AI suggestion never clicks element",
      async ({ page }, testInfo) => {
        let fetchCalls = 0;

        const { locator } = createSelfHealingRuntime(
          page,
          testEnvironment(),
          {
            productionConfig,
            fetchImpl: async () => {
              fetchCalls++;
              return mockResponse();
            },
          }
        );

        await expect(
          locator.resolve(
            "#old-submit",
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
          "Self-healing failed for locator: #old-submit"
        );

        expect(fetchCalls).toBe(1);

        const clicked = await page.evaluate(
          () => (window as any).clicked === true
        );

        expect(clicked).toBe(false);

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
        expect(audit.confidence).toBe(0.99);
        expect(audit).not.toHaveProperty(
          "suggestedSelector"
        );
      }
    );

    test(
      "E2E-004: unauthorized runtime blocks OpenAI",
      async ({ page }) => {
        let fetchCalls = 0;

        expect(() =>
          createSelfHealingRuntime(
            page,
            testEnvironment({
              AI_ALLOW_EXTERNAL_REQUESTS: "false",
            }),
            {
              productionConfig,
              fetchImpl: async () => {
                fetchCalls++;
                return mockResponse();
              },
            }
          )
        ).toThrow("EXTERNAL_AI_NOT_AUTHORIZED");

        expect(fetchCalls).toBe(0);
      }
    );

    test(
      "E2E-005: disabled recovery makes no AI request",
      async ({ page }) => {
        let fetchCalls = 0;

        const { locator } = createSelfHealingRuntime(
          page,
          testEnvironment({
            AI_RECOVERY_ENABLED: "false",
          }),
          {
            productionConfig,
            fetchImpl: async () => {
              fetchCalls++;
              return mockResponse();
            },
          }
        );

        await expect(
          locator.resolve(
            "#old-submit",
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

        expect(fetchCalls).toBe(0);
      }
    );
  }
);

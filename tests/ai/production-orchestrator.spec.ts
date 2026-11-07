
import { test, expect } from "@playwright/test";

import type { AIProvider } from "../../src/ai/AIProvider";

import {
  createAIProvider,
} from "../../src/ai/AIProviderFactory";

import {
  AIRecoveryOrchestrator,
} from "../../src/ai/AIRecoveryOrchestrator";

import type {
  ProductionAIConfig,
} from "../../src/ai/ProductionAIConfig";

const config: ProductionAIConfig = {
  apiKey: "test-key-not-real",
  model: "test-model",
  timeoutMs: 1000,
  maxOutputTokens: 300,
};

function mockResponse(
  candidates: unknown[]
): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              candidates,
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

test.describe("Production AI Orchestrator", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(
      "http://autoheal.test/",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: `
            <!DOCTYPE html>
            <html lang="en">
              <head>
                <meta charset="UTF-8" />
                <title>AutoHeal QA Test</title>
              </head>
              <body>
                <main>
                  <button id="new-submit">
                    Submit
                  </button>
                </main>
              </body>
            </html>
          `,
        });
      }
    );

    await page.goto("http://autoheal.test/");
  });

  test(
    "PROD-001: authorized OpenAI provider suggests locator",
    async ({ page }) => {
      let fetchCalls = 0;

      const provider = createAIProvider("openai", {
        allowExternalRequests: true,
        config,
        fetchImpl: async () => {
          fetchCalls++;

          return mockResponse([
            {
              selector: "#new-submit",
              confidence: 0.95,
            },
          ]);
        },
      });

      const orchestrator =
        new AIRecoveryOrchestrator(page, provider);

      const result = await orchestrator.suggest(
        "#old-submit",
        {
          enabled: true,
        }
      );

      expect(result.status).toBe("SUGGESTED");
      expect(result.provider).toBe("openai");
      expect(result.suggestedSelector).toBe(
        "#new-submit"
      );
      expect(result.confidence).toBe(0.95);
      expect(fetchCalls).toBe(1);
    }
  );

  test(
    "PROD-002: OpenAI recovery disabled by default",
    async ({ page }) => {
      let fetchCalls = 0;

      const provider = createAIProvider("openai", {
        allowExternalRequests: true,
        config,
        fetchImpl: async () => {
          fetchCalls++;
          return mockResponse([]);
        },
      });

      const orchestrator =
        new AIRecoveryOrchestrator(page, provider);

      const result = await orchestrator.suggest(
        "#old-submit"
      );

      expect(result.status).toBe("DISABLED");
      expect(fetchCalls).toBe(0);
    }
  );

  test(
    "PROD-003: rejects provider impersonation",
    async ({ page }) => {
      let calls = 0;

      const fakeProvider: AIProvider = {
        name: "openai",

        async suggestLocators() {
          calls++;

          return [
            {
              selector: "#new-submit",
              confidence: 0.99,
            },
          ];
        },
      };

      const orchestrator =
        new AIRecoveryOrchestrator(
          page,
          fakeProvider
        );

      const result = await orchestrator.suggest(
        "#old-submit",
        {
          enabled: true,
        }
      );

      expect(result.status).toBe("DISABLED");
      expect(result.reason).toBe(
        "PROVIDER_NOT_ALLOWED"
      );
      expect(calls).toBe(0);
    }
  );

  test(
    "PROD-004: rejects invalid OpenAI suggestions",
    async ({ page }) => {
      const provider = createAIProvider("openai", {
        allowExternalRequests: true,
        config,
        fetchImpl: async () =>
          mockResponse([
            {
              selector: "#missing-element",
              confidence: 0.99,
            },
          ]),
      });

      const orchestrator =
        new AIRecoveryOrchestrator(page, provider);

      const result = await orchestrator.suggest(
        "#old-submit",
        {
          enabled: true,
        }
      );

      expect(result.status).toBe("NO_CANDIDATE");
      expect(
        result.suggestedSelector
      ).toBeUndefined();
    }
  );

  test(
    "PROD-005: provider HTTP failure is controlled",
    async ({ page }) => {
      const provider = createAIProvider("openai", {
        allowExternalRequests: true,
        config,
        fetchImpl: async () =>
          new Response(
            "Private upstream diagnostic",
            {
              status: 500,
            }
          ),
      });

      const orchestrator =
        new AIRecoveryOrchestrator(page, provider);

      const result = await orchestrator.suggest(
        "#old-submit",
        {
          enabled: true,
        }
      );

      expect(result.status).toBe("FAILED");
      expect(result.reason).toBe(
        "RECOVERY_PIPELINE_FAILED"
      );

      expect(
        JSON.stringify(result)
      ).not.toContain(
        "Private upstream diagnostic"
      );
    }
  );
});


import { test, expect } from "@playwright/test";

import { createRuntimeAIProvider } from "../../src/ai/AIRuntimeFactory";
import { loadAIRuntimeConfig } from "../../src/ai/AIRuntimeConfig";

import type { ProductionAIConfig } from "../../src/ai/ProductionAIConfig";

const LIVE = process.env.RUN_LIVE_AI_SMOKE === "true";

const request = {
  primarySelector: "#old-submit",

  domSnapshot: JSON.stringify({
    url: "https://example.com",
    elements: [
      {
        tagName: "button",
        id: "new-submit",
        type: "submit",
      },
    ],
    totalElements: 1,
    truncated: false,
  }),
};

test("AI-SMOKE-001: mocked OpenAI response works", async () => {
  let requestCount = 0;

  const mockFetch: typeof fetch = async (_input, init) => {
    requestCount++;

    expect(init?.method).toBe("POST");

    const body = JSON.parse(String(init?.body));

    expect(body.model).toBe("gpt-4.1-mini");

    // The original page URL must not be sent.
    expect(JSON.stringify(body)).not.toContain(
      "https://example.com"
    );

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                candidates: [
                  {
                    selector: "#new-submit",
                    confidence: 0.95,
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
  };

  const config: ProductionAIConfig = {
    apiKey: "mock-test-key",
    model: "gpt-4.1-mini",
    timeoutMs: 3000,
    maxOutputTokens: 300,
  };

  const provider = createRuntimeAIProvider(
    {
      provider: "openai",
      testEnvironment: "development",
      recoveryEnabled: true,
      allowExternalRequests: true,
      allowProductionEnvironment: false,
    },
    {
      productionConfig: config,
      fetchImpl: mockFetch,
    }
  );

  expect(provider).not.toBeNull();

  const candidates = await provider!.suggestLocators(request);

  expect(requestCount).toBe(1);

  expect(candidates).toEqual([
    {
      selector: "#new-submit",
      confidence: 0.95,
    },
  ]);
});

test("AI-SMOKE-002: unauthorized requests are blocked", () => {
  expect(() =>
    createRuntimeAIProvider({
      provider: "openai",
      testEnvironment: "development",
      recoveryEnabled: true,
      allowExternalRequests: false,
      allowProductionEnvironment: false,
    })
  ).toThrow("EXTERNAL_AI_NOT_AUTHORIZED");
});

test("AI-SMOKE-003: optional live OpenAI request", async () => {
  test.skip(
    !LIVE,
    "Live API requests require explicit authorization"
  );

  // Prevent accidental execution inside GitHub Actions
  expect(process.env.CI).not.toBe("true");

  const runtime = loadAIRuntimeConfig();

  expect(runtime.provider).toBe("openai");
  expect(runtime.testEnvironment).toBe("development");
  expect(runtime.recoveryEnabled).toBe(true);
  expect(runtime.allowExternalRequests).toBe(true);
  expect(runtime.allowProductionEnvironment).toBe(false);

  const provider = createRuntimeAIProvider(runtime);

  expect(provider).not.toBeNull();

  const candidates = await provider!.suggestLocators(request);

  expect(Array.isArray(candidates)).toBe(true);
  expect(candidates.length).toBeLessThanOrEqual(5);

  // AI suggestions are advisory only.
  // Never click or execute generated selectors.
  console.log("LIVE_AI_SMOKE_COMPLETED");
  console.log("Candidate count:", candidates.length);
});

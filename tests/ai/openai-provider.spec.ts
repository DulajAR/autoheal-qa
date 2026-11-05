
import { test, expect } from "@playwright/test";

import { OpenAIProvider } from "../../src/ai/OpenAIProvider";

import type {
  ProductionAIConfig,
} from "../../src/ai/ProductionAIConfig";

const config: ProductionAIConfig = {
  apiKey: "test-key-not-real",
  model: "test-model",
  timeoutMs: 1000,
  maxOutputTokens: 300,
};

const request = {
  primarySelector: "#old-submit",
  domSnapshot: JSON.stringify({
    url: "https://example.test",
    elements: [
      {
        tagName: "button",
        id: "new-submit",
      },
    ],
    totalElements: 1,
    truncated: false,
  }),
};

test.describe("OpenAI Provider", () => {
  test("OAI-001: external requests disabled by default", async () => {
    const provider = new OpenAIProvider(config, {
      allowExternalRequests: false,
      fetchImpl: async () => {
        throw new Error("Fetch must not run");
      },
    });

    await expect(
      provider.suggestLocators({ ...request })
    ).rejects.toThrow(
      "EXTERNAL_AI_NOT_AUTHORIZED"
    );
  });

  test("OAI-002: parses valid suggestions", async () => {
    const provider = new OpenAIProvider(config, {
      allowExternalRequests: true,
      fetchImpl: async () =>
        new Response(
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
          { status: 200 }
        ),
    });

    const candidates =
      await provider.suggestLocators({ ...request });

    expect(candidates).toEqual([
      {
        selector: "#new-submit",
        confidence: 0.95,
      },
    ]);
  });

  test("OAI-003: rejects invalid confidence", async () => {
    const provider = new OpenAIProvider(config, {
      allowExternalRequests: true,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    candidates: [
                      {
                        selector: "#new-submit",
                        confidence: 1.5,
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200 }
        ),
    });

    await expect(
      provider.suggestLocators({ ...request })
    ).rejects.toThrow(
      "OPENAI_PROVIDER_FAILED"
    );
  });

  test("OAI-004: handles provider HTTP failures", async () => {
    const provider = new OpenAIProvider(config, {
      allowExternalRequests: true,
      fetchImpl: async () =>
        new Response("Internal provider error", {
          status: 500,
        }),
    });

    await expect(
      provider.suggestLocators({ ...request })
    ).rejects.toThrow(
      "OPENAI_PROVIDER_FAILED"
    );
  });
});

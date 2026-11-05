
import { test, expect } from "@playwright/test";

import { OpenAIProvider } from "../../src/ai/OpenAIProvider";

import type { ProductionAIConfig } from "../../src/ai/ProductionAIConfig";

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

function mockSuccessResponse(
  candidates: unknown[] = []
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

test.describe("OpenAI Provider", () => {
  test("OAI-001: external requests disabled by default", async () => {
    let fetchCalls = 0;

    const provider = new OpenAIProvider(config, {
      allowExternalRequests: false,
      fetchImpl: async () => {
        fetchCalls++;
        throw new Error("Fetch must not run");
      },
    });

    await expect(
      provider.suggestLocators({ ...request })
    ).rejects.toThrow("EXTERNAL_AI_NOT_AUTHORIZED");

    expect(fetchCalls).toBe(0);
  });

  test("OAI-002: parses valid suggestions", async () => {
    const provider = new OpenAIProvider(config, {
      allowExternalRequests: true,
      fetchImpl: async () =>
        mockSuccessResponse([
          {
            selector: "#new-submit",
            confidence: 0.95,
          },
        ]),
    });

    const candidates = await provider.suggestLocators({
      ...request,
    });

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
        mockSuccessResponse([
          {
            selector: "#new-submit",
            confidence: 1.5,
          },
        ]),
    });

    await expect(
      provider.suggestLocators({ ...request })
    ).rejects.toThrow("OPENAI_PROVIDER_FAILED");
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
    ).rejects.toThrow("OPENAI_PROVIDER_FAILED");
  });
});

test.describe("OpenAI Provider hardening", () => {
  test("OAI-005: does not mutate the original request", async () => {
    const original = {
      ...request,
    };

    const originalSnapshot = original.domSnapshot;

    const provider = new OpenAIProvider(config, {
      allowExternalRequests: true,
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body));

        const transmitted = JSON.parse(
          body.messages[1].content
        );

        const snapshot = JSON.parse(
          transmitted.domSnapshot
        );

        expect(snapshot.url).toBeUndefined();

        expect(snapshot.elements[0].id).toBe(
          "new-submit"
        );

        return mockSuccessResponse([]);
      },
    });

    await provider.suggestLocators(original);

    expect(original.domSnapshot).toBe(originalSnapshot);
  });

  test("OAI-006: rejects arbitrary DOM text", async () => {
    let fetchCalls = 0;

    const provider = new OpenAIProvider(config, {
      allowExternalRequests: true,
      fetchImpl: async () => {
        fetchCalls++;
        return mockSuccessResponse([]);
      },
    });

    const unsafeRequest = {
      ...request,
      domSnapshot: JSON.stringify({
        url: "https://example.test",
        elements: [
          {
            tagName: "button",
            id: "new-submit",
            text: "Private customer information",
          },
        ],
        totalElements: 1,
        truncated: false,
      }),
    };

    await expect(
      provider.suggestLocators(unsafeRequest)
    ).rejects.toThrow("INVALID_AI_REQUEST");

    expect(fetchCalls).toBe(0);
  });

  test("OAI-007: rejects sensitive identifiers", async () => {
    let fetchCalls = 0;

    const provider = new OpenAIProvider(config, {
      allowExternalRequests: true,
      fetchImpl: async () => {
        fetchCalls++;
        return mockSuccessResponse([]);
      },
    });

    const unsafeRequest = {
      ...request,
      domSnapshot: JSON.stringify({
        url: "https://example.test",
        elements: [
          {
            tagName: "button",
            id: "sessionToken",
          },
        ],
        totalElements: 1,
        truncated: false,
      }),
    };

    await expect(
      provider.suggestLocators(unsafeRequest)
    ).rejects.toThrow("INVALID_AI_REQUEST");

    expect(fetchCalls).toBe(0);
  });

  test("OAI-008: rejects invalid primary selectors", async () => {
    let fetchCalls = 0;

    const provider = new OpenAIProvider(config, {
      allowExternalRequests: true,
      fetchImpl: async () => {
        fetchCalls++;
        return mockSuccessResponse([]);
      },
    });

    await expect(
      provider.suggestLocators({
        ...request,
        primarySelector: "body script",
      })
    ).rejects.toThrow("INVALID_AI_REQUEST");

    expect(fetchCalls).toBe(0);
  });

  test("OAI-009: rejects oversized responses", async () => {
    const provider = new OpenAIProvider(config, {
      allowExternalRequests: true,
      fetchImpl: async () =>
        new Response("x".repeat(40_000), {
          status: 200,
        }),
    });

    await expect(
      provider.suggestLocators({ ...request })
    ).rejects.toThrow("OPENAI_PROVIDER_FAILED");
  });

  test("OAI-010: enforces timeout", async () => {
    const timeoutConfig: ProductionAIConfig = {
      ...config,
      timeoutMs: 30,
    };

    const provider = new OpenAIProvider(timeoutConfig, {
      allowExternalRequests: true,
      fetchImpl: async () =>
        new Promise<Response>(() => undefined),
    });

    await expect(
      provider.suggestLocators({ ...request })
    ).rejects.toThrow("OPENAI_PROVIDER_FAILED");
  });

  test("OAI-011: hides upstream response details", async () => {
    const provider = new OpenAIProvider(config, {
      allowExternalRequests: true,
      fetchImpl: async () =>
        new Response(
          "Sensitive provider diagnostic",
          {
            status: 500,
          }
        ),
    });

    await expect(
      provider.suggestLocators({ ...request })
    ).rejects.toThrow(/^OPENAI_PROVIDER_FAILED$/);
  });
});

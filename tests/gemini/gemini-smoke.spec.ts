
import { test, expect } from "@playwright/test";

import {
  createRuntimeAIProvider,
} from "../../src/ai/AIRuntimeFactory";

import {
  createAIProvider,
  isAuthorizedProductionProvider,
} from "../../src/ai/AIProviderFactory";

import {
  loadAIRuntimeConfig,
} from "../../src/ai/AIRuntimeConfig";

import {
  loadGeminiAIConfig,
} from "../../src/ai/GeminiAIConfig";

import type {
  GeminiAIConfig,
} from "../../src/ai/GeminiAIConfig";

import type {
  AILocatorRequest,
} from "../../src/ai/AIProvider";

// ============================================================
// AutoHeal QA - Gemini Mocked Smoke Tests
// Phase 4.0.6D
//
// All network requests use injected mock fetch.
// No real Gemini API calls are performed.
// ============================================================

const request: AILocatorRequest = {
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

const config: GeminiAIConfig = {
  apiKey: "mock-gemini-key",
  model: "gemini-test-model",
  timeoutMs: 3000,
  maxOutputTokens: 512,
};

const runtime = {
  provider: "gemini" as const,
  testEnvironment: "development" as const,
  recoveryEnabled: true,
  allowExternalRequests: true,
  allowProductionEnvironment: false,
};

function geminiResponse(
  content: string,
  finishReason = "STOP"
): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [{ text: content }],
          },
          finishReason,
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

function provider(
  fetchImpl: typeof fetch,
  override: Partial<GeminiAIConfig> = {}
) {
  const result = createRuntimeAIProvider(
    runtime,
    {
      geminiConfig: {
        ...config,
        ...override,
      },
      fetchImpl,
    }
  );

  if (!result) {
    throw new Error("PROVIDER_MISSING");
  }

  return result;
}

// ------------------------------------------------------------
// GEMINI-001: Valid mocked response
// ------------------------------------------------------------

test(
  "GEMINI-001: mocked response returns safe suggestions",
  async () => {
    let calls = 0;

    const mockFetch: typeof fetch = async (
      input,
      init
    ) => {
      calls++;

      expect(String(input)).toBe(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent"
      );

      expect(init?.method).toBe("POST");

      expect(
        new Headers(init?.headers).get(
          "x-goog-api-key"
        )
      ).toBe("mock-gemini-key");

      const body = JSON.parse(
        String(init?.body)
      );

      expect(
        body.generationConfig.responseMimeType
      ).toBe("application/json");

      expect(
        JSON.stringify(body)
      ).not.toContain(
        "https://example.com"
      );

      return geminiResponse(
        JSON.stringify({
          candidates: [
            {
              selector: "#new-submit",
              confidence: 0.95,
            },
          ],
        })
      );
    };

    const p = provider(mockFetch);

    expect(
      isAuthorizedProductionProvider(p)
    ).toBe(true);

    expect(
      await p.suggestLocators(request)
    ).toEqual([
      {
        selector: "#new-submit",
        confidence: 0.95,
      },
    ]);

    expect(calls).toBe(1);
  }
);

// ------------------------------------------------------------
// GEMINI-002: Unauthorized external access
// ------------------------------------------------------------

test(
  "GEMINI-002: unauthorized external access rejected",
  () => {
    expect(() =>
      createAIProvider("gemini", {
        allowExternalRequests: false,
        geminiConfig: config,
      })
    ).toThrow(
      "EXTERNAL_AI_NOT_AUTHORIZED"
    );
  }
);

// ------------------------------------------------------------
// GEMINI-003: Malformed JSON
// ------------------------------------------------------------

test(
  "GEMINI-003: malformed JSON rejected",
  async () => {
    const p = provider(
      async () =>
        geminiResponse("not-json")
    );

    await expect(
      p.suggestLocators(request)
    ).rejects.toThrow(
      "GEMINI_PROVIDER_FAILED"
    );
  }
);

// ------------------------------------------------------------
// GEMINI-004: Request timeout
// ------------------------------------------------------------

test(
  "GEMINI-004: timeout aborts request",
  async () => {
    let aborted = false;

    const mockFetch: typeof fetch = async (
      _input,
      init
    ) =>
      new Promise<Response>(
        (_resolve, reject) => {
          const signal = init?.signal;

          if (!signal) {
            reject(
              new Error("Missing AbortSignal")
            );
            return;
          }

          if (signal.aborted) {
            aborted = true;
            reject(new Error("Aborted"));
            return;
          }

          signal.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(new Error("Aborted"));
            },
            { once: true }
          );
        }
      );

    const p = provider(mockFetch, {
      timeoutMs: 100,
    });

    await expect(
      p.suggestLocators(request)
    ).rejects.toThrow(
      "GEMINI_PROVIDER_FAILED"
    );

    expect(aborted).toBe(true);
  }
);

// ------------------------------------------------------------
// GEMINI-005: Unsafe selector
// ------------------------------------------------------------

test(
  "GEMINI-005: unsafe selector rejected",
  async () => {
    const p = provider(
      async () =>
        geminiResponse(
          JSON.stringify({
            candidates: [
              {
                selector:
                  "button:has-text('Delete')",
                confidence: 0.99,
              },
            ],
          })
        )
    );

    await expect(
      p.suggestLocators(request)
    ).rejects.toThrow(
      "GEMINI_PROVIDER_FAILED"
    );
  }
);

// ------------------------------------------------------------
// GEMINI-006: Production authorization
// ------------------------------------------------------------

test(
  "GEMINI-006: production requires authorization",
  () => {
    expect(() =>
      createRuntimeAIProvider(
        {
          ...runtime,
          testEnvironment: "production",
          allowProductionEnvironment: false,
        },
        {
          geminiConfig: config,
          fetchImpl: async () =>
            geminiResponse(
              '{"candidates":[]}'
            ),
        }
      )
    ).toThrow(
      "PRODUCTION_AI_NOT_AUTHORIZED"
    );
  }
);

// ------------------------------------------------------------
// GEMINI-007: Default disabled runtime
// ------------------------------------------------------------

test(
  "GEMINI-007: default runtime is disabled",
  () => {
    const loaded =
      loadAIRuntimeConfig({});

    expect(loaded.provider).toBe(
      "disabled"
    );

    expect(
      loaded.recoveryEnabled
    ).toBe(false);

    expect(
      loaded.allowExternalRequests
    ).toBe(false);

    expect(
      createRuntimeAIProvider(loaded)
    ).toBeNull();
  }
);

// ------------------------------------------------------------
// GEMINI-008: Missing credentials
// ------------------------------------------------------------

test(
  "GEMINI-008: missing credentials rejected",
  () => {
    expect(() =>
      loadGeminiAIConfig({
        GEMINI_API_KEY: "",
        GEMINI_MODEL:
          "gemini-test-model",
      })
    ).toThrow(
      "INVALID_GEMINI_API_KEY"
    );
  }
);

// ------------------------------------------------------------
// GEMINI-009: Missing model
// ------------------------------------------------------------

test(
  "GEMINI-009: missing model rejected",
  () => {
    expect(() =>
      loadGeminiAIConfig({
        GEMINI_API_KEY: "mock-key",
      })
    ).toThrow(
      "INVALID_GEMINI_MODEL"
    );
  }
);

// ------------------------------------------------------------
// GEMINI-010: Blocked response
// ------------------------------------------------------------

test(
  "GEMINI-010: blocked response rejected",
  async () => {
    const p = provider(
      async () =>
        geminiResponse(
          '{"candidates":[]}',
          "SAFETY"
        )
    );

    await expect(
      p.suggestLocators(request)
    ).rejects.toThrow(
      "GEMINI_PROVIDER_FAILED"
    );
  }
);

// ------------------------------------------------------------
// GEMINI-011: Offline mock provider
// ------------------------------------------------------------

test(
  "GEMINI-011: mock provider works offline",
  () => {
    const p =
      createRuntimeAIProvider({
        ...runtime,
        provider: "mock",
        allowExternalRequests: false,
      });

    expect(p?.name).toBe("mock");
  }
);

// ------------------------------------------------------------
// GEMINI-012: HTTP error
// ------------------------------------------------------------

test(
  "GEMINI-012: HTTP 429 rejected",
  async () => {
    const p = provider(
      async () =>
        new Response("Rate limit", {
          status: 429,
        })
    );

    await expect(
      p.suggestLocators(request)
    ).rejects.toThrow(
      "GEMINI_PROVIDER_FAILED"
    );
  }
);

// ------------------------------------------------------------
// GEMINI-013: Sensitive DOM rejection
// ------------------------------------------------------------

test(
  "GEMINI-013: unsafe DOM data rejected before fetch",
  async () => {
    let calls = 0;

    const p = provider(async () => {
      calls++;

      return geminiResponse(
        '{"candidates":[]}'
      );
    });

    const unsafeRequest = {
      ...request,
      domSnapshot: JSON.stringify({
        url: "https://example.com",
        elements: [
          {
            tagName: "input",
            id: "password",
            type: "password",
          },
        ],
        totalElements: 1,
        truncated: false,
      }),
    };

    await expect(
      p.suggestLocators(unsafeRequest)
    ).rejects.toThrow(
      "INVALID_AI_REQUEST"
    );

    expect(calls).toBe(0);
  }
);

// ------------------------------------------------------------
// GEMINI-014: Maximum candidate limit
// ------------------------------------------------------------

test(
  "GEMINI-014: candidate count is bounded",
  async () => {
    const candidates =
      Array.from(
        { length: 6 },
        (_, i) => ({
          selector: `#item${i}`,
          confidence: 0.5,
        })
      );

    const p = provider(
      async () =>
        geminiResponse(
          JSON.stringify({
            candidates,
          })
        )
    );

    await expect(
      p.suggestLocators(request)
    ).rejects.toThrow(
      "GEMINI_PROVIDER_FAILED"
    );
  }
);

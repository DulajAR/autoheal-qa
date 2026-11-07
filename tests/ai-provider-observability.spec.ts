
import { test, expect } from "@playwright/test";

import {
  AIProviderDiagnostics,
} from "../src/ai/AIProviderDiagnostics";

import {
  OpenAIProvider,
} from "../src/ai/OpenAIProvider";

import {
  GeminiProvider,
} from "../src/ai/GeminiProvider";

import {
  createAIProvider,
} from "../src/ai/AIProviderFactory";

import {
  createRuntimeAIProvider,
} from "../src/ai/AIRuntimeFactory";

import type {
  AILocatorRequest,
} from "../src/ai/AIProvider";

import type {
  ProductionAIConfig,
} from "../src/ai/ProductionAIConfig";

import type {
  GeminiAIConfig,
} from "../src/ai/GeminiAIConfig";

import type {
  AIRuntimeConfig,
} from "../src/ai/AIRuntimeConfig";

/**
 * AutoHeal QA
 * Phase 4.0.7 - AI Provider Observability
 *
 * Tests:
 * OBS-001 to OBS-013
 *
 * All HTTP requests are mocked.
 * No real AI API calls are performed.
 */

// ============================================================
// Shared configurations
// ============================================================

const openAIConfig: ProductionAIConfig = {
  apiKey: "test-key-not-real",
  model: "test-model",
  timeoutMs: 1000,
  maxOutputTokens: 300,
};

const geminiConfig: GeminiAIConfig = {
  apiKey: "test-key-not-real",
  model: "test-model",
  timeoutMs: 1000,
  maxOutputTokens: 300,
};

// ============================================================
// Valid sanitized request fixture
// ============================================================

const request: AILocatorRequest = {
  primarySelector: "#login",
  domSnapshot: JSON.stringify({
    url: "https://example.test",
    elements: [
      {
        tagName: "button",
        id: "login",
      },
    ],
    totalElements: 1,
    truncated: false,
  }),
};

// ============================================================
// Mock HTTP helpers
// ============================================================

function mockResponse(
  body: unknown,
  status = 200
): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    })) as typeof fetch;
}

function openAIResponse() {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({
            candidates: [
              {
                selector: "#login",
                confidence: 0.95,
              },
            ],
          }),
        },
      },
    ],
  };
}

function geminiResponse() {
  return {
    candidates: [
      {
        finishReason: "STOP",
        content: {
          parts: [
            {
              text: JSON.stringify({
                candidates: [
                  {
                    selector: "#login",
                    confidence: 0.95,
                  },
                ],
              }),
            },
          ],
        },
      },
    ],
  };
}

// ============================================================
// OBS-001 to OBS-008
// Core provider observability
// ============================================================

test.describe(
  "Phase 4.0.7 - AI Provider Observability",
  () => {
    test(
      "OBS-001: OpenAI records success",
      async () => {
        const diagnostics =
          new AIProviderDiagnostics();

        const provider = new OpenAIProvider(
          openAIConfig,
          {
            allowExternalRequests: true,
            fetchImpl: mockResponse(
              openAIResponse()
            ),
            diagnostics,
          }
        );

        const candidates =
          await provider.suggestLocators(request);

        expect(candidates).toHaveLength(1);

        expect(diagnostics.getEvents()).toHaveLength(1);

        expect(diagnostics.getEvents()[0]).toMatchObject({
          provider: "openai",
          outcome: "success",
          errorCode: "NONE",
          candidateCount: 1,
        });
      }
    );

    test(
      "OBS-002: Gemini records success",
      async () => {
        const diagnostics =
          new AIProviderDiagnostics();

        const provider = new GeminiProvider(
          geminiConfig,
          {
            allowExternalRequests: true,
            fetchImpl: mockResponse(
              geminiResponse()
            ),
            diagnostics,
          }
        );

        const candidates =
          await provider.suggestLocators(request);

        expect(candidates).toHaveLength(1);

        expect(diagnostics.getEvents()).toHaveLength(1);

        expect(diagnostics.getEvents()[0]).toMatchObject({
          provider: "gemini",
          outcome: "success",
          errorCode: "NONE",
          candidateCount: 1,
        });
      }
    );

    test(
      "OBS-003: OpenAI classifies HTTP 401",
      async () => {
        const diagnostics =
          new AIProviderDiagnostics();

        const provider = new OpenAIProvider(
          openAIConfig,
          {
            allowExternalRequests: true,
            fetchImpl: mockResponse({}, 401),
            diagnostics,
          }
        );

        await expect(
          provider.suggestLocators(request)
        ).rejects.toThrow(
          "OPENAI_PROVIDER_FAILED"
        );

        expect(diagnostics.getEvents()).toHaveLength(1);

        expect(diagnostics.getEvents()[0].errorCode).toBe(
          "AUTHENTICATION_ERROR"
        );
      }
    );

    test(
      "OBS-004: Gemini classifies HTTP 429",
      async () => {
        const diagnostics =
          new AIProviderDiagnostics();

        const provider = new GeminiProvider(
          geminiConfig,
          {
            allowExternalRequests: true,
            fetchImpl: mockResponse({}, 429),
            diagnostics,
          }
        );

        await expect(
          provider.suggestLocators(request)
        ).rejects.toThrow(
          "GEMINI_PROVIDER_FAILED"
        );

        expect(diagnostics.getEvents()).toHaveLength(1);

        expect(diagnostics.getEvents()[0].errorCode).toBe(
          "RATE_LIMITED"
        );
      }
    );

    test(
      "OBS-005: malformed OpenAI response",
      async () => {
        const diagnostics =
          new AIProviderDiagnostics();

        const provider = new OpenAIProvider(
          openAIConfig,
          {
            allowExternalRequests: true,
            fetchImpl: mockResponse({
              invalid: true,
            }),
            diagnostics,
          }
        );

        await expect(
          provider.suggestLocators(request)
        ).rejects.toThrow(
          "OPENAI_PROVIDER_FAILED"
        );

        expect(diagnostics.getEvents()).toHaveLength(1);

        expect(diagnostics.getEvents()[0].errorCode).toBe(
          "INVALID_RESPONSE"
        );
      }
    );

    test(
      "OBS-006: malformed Gemini response",
      async () => {
        const diagnostics =
          new AIProviderDiagnostics();

        const provider = new GeminiProvider(
          geminiConfig,
          {
            allowExternalRequests: true,
            fetchImpl: mockResponse({
              invalid: true,
            }),
            diagnostics,
          }
        );

        await expect(
          provider.suggestLocators(request)
        ).rejects.toThrow(
          "GEMINI_PROVIDER_FAILED"
        );

        expect(diagnostics.getEvents()).toHaveLength(1);

        expect(diagnostics.getEvents()[0].errorCode).toBe(
          "INVALID_RESPONSE"
        );
      }
    );

    test(
      "OBS-007: diagnostics exclude secrets",
      async () => {
        const diagnostics =
          new AIProviderDiagnostics();

        const provider = new OpenAIProvider(
          {
            ...openAIConfig,
            apiKey: "PRIVATE_TEST_API_KEY_123",
          },
          {
            allowExternalRequests: true,
            fetchImpl: mockResponse(
              openAIResponse()
            ),
            diagnostics,
          }
        );

        await provider.suggestLocators(request);

        const serialized = JSON.stringify(
          diagnostics.getEvents()
        );

        expect(serialized).not.toContain(
          "PRIVATE_TEST_API_KEY_123"
        );

        expect(serialized).not.toContain(
          "domSnapshot"
        );

        expect(serialized).not.toContain(
          "#login"
        );
      }
    );

    test(
      "OBS-008: metrics remain isolated",
      async () => {
        const diagnostics =
          new AIProviderDiagnostics();

        const openai = new OpenAIProvider(
          openAIConfig,
          {
            allowExternalRequests: true,
            fetchImpl: mockResponse(
              openAIResponse()
            ),
            diagnostics,
          }
        );

        const gemini = new GeminiProvider(
          geminiConfig,
          {
            allowExternalRequests: true,
            fetchImpl: mockResponse({}, 429),
            diagnostics,
          }
        );

        await openai.suggestLocators(request);

        await expect(
          gemini.suggestLocators(request)
        ).rejects.toThrow(
          "GEMINI_PROVIDER_FAILED"
        );

        expect(
          diagnostics.getMetrics("openai")
            .successfulRequests
        ).toBe(1);

        expect(
          diagnostics.getMetrics("gemini")
            .failedRequests
        ).toBe(1);
      }
    );
  }
);

// ============================================================
// OBS-009 to OBS-013
// Timeout and factory integration hardening
// ============================================================

test.describe(
  "Phase 4.0.7 - Observability Hardening",
  () => {
    test(
      "OBS-009: OpenAI timeout recorded once",
      async () => {
        const diagnostics =
          new AIProviderDiagnostics();

        const provider = new OpenAIProvider(
          {
            ...openAIConfig,
            timeoutMs: 30,
          },
          {
            allowExternalRequests: true,
            diagnostics,
            fetchImpl: (() =>
              new Promise<Response>(() => {})
            ) as typeof fetch,
          }
        );

        await expect(
          provider.suggestLocators(request)
        ).rejects.toThrow(
          "OPENAI_PROVIDER_FAILED"
        );

        expect(diagnostics.getEvents()).toHaveLength(1);

        expect(diagnostics.getEvents()[0]).toMatchObject({
          provider: "openai",
          outcome: "failure",
          errorCode: "TIMEOUT",
          candidateCount: 0,
        });
      }
    );

    test(
      "OBS-010: Gemini timeout recorded once",
      async () => {
        const diagnostics =
          new AIProviderDiagnostics();

        const provider = new GeminiProvider(
          {
            ...geminiConfig,
            timeoutMs: 30,
          },
          {
            allowExternalRequests: true,
            diagnostics,
            fetchImpl: (() =>
              new Promise<Response>(() => {})
            ) as typeof fetch,
          }
        );

        await expect(
          provider.suggestLocators(request)
        ).rejects.toThrow(
          "GEMINI_PROVIDER_FAILED"
        );

        expect(diagnostics.getEvents()).toHaveLength(1);

        expect(diagnostics.getEvents()[0]).toMatchObject({
          provider: "gemini",
          outcome: "failure",
          errorCode: "TIMEOUT",
          candidateCount: 0,
        });
      }
    );

    test(
      "OBS-011: late OpenAI response cannot change timeout",
      async () => {
        const diagnostics =
          new AIProviderDiagnostics();

        let resolveFetch!: (response: Response) => void;

        const fetchImpl = (() =>
          new Promise<Response>(resolve => {
            resolveFetch = resolve;
          })) as typeof fetch;

        const provider = new OpenAIProvider(
          {
            ...openAIConfig,
            timeoutMs: 30,
          },
          {
            allowExternalRequests: true,
            diagnostics,
            fetchImpl,
          }
        );

        await expect(
          provider.suggestLocators(request)
        ).rejects.toThrow(
          "OPENAI_PROVIDER_FAILED"
        );

        const before = diagnostics.getEvents();

        resolveFetch(
          new Response(
            JSON.stringify(openAIResponse()),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            }
          )
        );

        await new Promise<void>(resolve => {
          setTimeout(resolve, 20);
        });

        expect(diagnostics.getEvents()).toEqual(before);

        expect(diagnostics.getEvents()).toHaveLength(1);

        expect(diagnostics.getEvents()[0].errorCode).toBe(
          "TIMEOUT"
        );
      }
    );

    test(
      "OBS-012: AIProviderFactory forwards diagnostics",
      async () => {
        const diagnostics =
          new AIProviderDiagnostics();

        const provider = createAIProvider(
          "openai",
          {
            allowExternalRequests: true,
            config: openAIConfig,
            fetchImpl: mockResponse(
              openAIResponse()
            ),
            diagnostics,
          }
        );

        expect(provider).not.toBeNull();

        await provider!.suggestLocators(request);

        expect(diagnostics.getEvents()).toHaveLength(1);

        expect(diagnostics.getEvents()[0]).toMatchObject({
          provider: "openai",
          outcome: "success",
          errorCode: "NONE",
        });
      }
    );

    test(
      "OBS-013: AIRuntimeFactory forwards diagnostics",
      async () => {
        const diagnostics =
          new AIProviderDiagnostics();

        const runtime = {
          recoveryEnabled: true,
          provider: "gemini",
          allowExternalRequests: true,
          allowProductionEnvironment: false,
          testEnvironment: "development",
        } as AIRuntimeConfig;

        const provider = createRuntimeAIProvider(
          runtime,
          {
            geminiConfig,
            fetchImpl: mockResponse(
              geminiResponse()
            ),
            diagnostics,
          }
        );

        expect(provider).not.toBeNull();

        await provider!.suggestLocators(request);

        expect(diagnostics.getEvents()).toHaveLength(1);

        expect(diagnostics.getEvents()[0]).toMatchObject({
          provider: "gemini",
          outcome: "success",
          errorCode: "NONE",
        });
      }
    );
  }
);

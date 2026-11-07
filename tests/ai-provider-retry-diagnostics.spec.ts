
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
  AIProviderRetryPolicy,
} from "../src/ai/AIProviderRetryPolicy";

/**
 * AutoHeal QA
 * Phase 4.0.9 - Retry Diagnostics Tests
 *
 * Coverage:
 * RDG-001: OpenAI retry recovery
 * RDG-002: Gemini rate-limit recovery
 * RDG-003: Non-retryable failure
 * RDG-004: Overall timeout
 * RDG-005: Sensitive data protection
 *
 * All HTTP requests are mocked.
 * No real AI API requests are made.
 */

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

const retryPolicy: AIProviderRetryPolicy = {
  maxRetries: 2,
  baseDelayMs: 1,
  maxDelayMs: 5,
};

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

/**
 * Return a valid OpenAI response.
 */
function openAIResponse(): Response {
  return new Response(
    JSON.stringify({
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
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}

/**
 * Return a valid Gemini response.
 */
function geminiResponse(): Response {
  return new Response(
    JSON.stringify({
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
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}

/**
 * Return a mocked HTTP error response.
 */
function httpError(
  status: number
): Response {
  return new Response(
    JSON.stringify({
      error: "MOCK_HTTP_ERROR",
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}

test.describe(
  "Phase 4.0.9 - AI Provider Retry Diagnostics",
  () => {
    /**
     * RDG-001
     *
     * OpenAI:
     * First attempt returns HTTP 503.
     * Second attempt succeeds.
     */
    test(
      "RDG-001: OpenAI records successful retry recovery",
      async () => {
        const diagnostics =
          new AIProviderDiagnostics();

        let calls = 0;

        const fetchImpl = (async () => {
          calls++;

          if (calls === 1) {
            return httpError(503);
          }

          return openAIResponse();
        }) as typeof fetch;

        const provider = new OpenAIProvider(
          openAIConfig,
          {
            allowExternalRequests: true,
            fetchImpl,
            diagnostics,
            retryPolicy,
          }
        );

        const candidates =
          await provider.suggestLocators(
            request
          );

        expect(candidates).toHaveLength(1);
        expect(calls).toBe(2);

        const events =
          diagnostics.getEvents();

        expect(events).toHaveLength(1);

        expect(events[0]).toMatchObject({
          provider: "openai",
          outcome: "success",
          errorCode: "NONE",
          candidateCount: 1,
          attemptCount: 2,
          retryCount: 1,
          lastRetryErrorCode: "HTTP_ERROR",
        });

        expect(
          diagnostics.getMetrics("openai")
            .totalRequests
        ).toBe(1);

        expect(
          diagnostics.getMetrics("openai")
            .successfulRequests
        ).toBe(1);
      }
    );

    /**
     * RDG-002
     *
     * Gemini:
     * First attempt returns HTTP 429.
     * Second attempt succeeds.
     */
    test(
      "RDG-002: Gemini records rate-limit retry recovery",
      async () => {
        const diagnostics =
          new AIProviderDiagnostics();

        let calls = 0;

        const fetchImpl = (async () => {
          calls++;

          if (calls === 1) {
            return httpError(429);
          }

          return geminiResponse();
        }) as typeof fetch;

        const provider = new GeminiProvider(
          geminiConfig,
          {
            allowExternalRequests: true,
            fetchImpl,
            diagnostics,
            retryPolicy,
          }
        );

        const candidates =
          await provider.suggestLocators(
            request
          );

        expect(candidates).toHaveLength(1);
        expect(calls).toBe(2);

        const events =
          diagnostics.getEvents();

        expect(events).toHaveLength(1);

        expect(events[0]).toMatchObject({
          provider: "gemini",
          outcome: "success",
          errorCode: "NONE",
          candidateCount: 1,
          attemptCount: 2,
          retryCount: 1,
          lastRetryErrorCode: "RATE_LIMITED",
        });

        expect(
          diagnostics.getMetrics("gemini")
            .totalRequests
        ).toBe(1);

        expect(
          diagnostics.getMetrics("gemini")
            .successfulRequests
        ).toBe(1);
      }
    );

    /**
     * RDG-003
     *
     * Authentication errors must not
     * trigger retries.
     */
    test(
      "RDG-003: non-retryable failure records zero retries",
      async () => {
        const diagnostics =
          new AIProviderDiagnostics();

        let calls = 0;

        const fetchImpl = (async () => {
          calls++;
          return httpError(401);
        }) as typeof fetch;

        const provider = new OpenAIProvider(
          openAIConfig,
          {
            allowExternalRequests: true,
            fetchImpl,
            diagnostics,
            retryPolicy,
          }
        );

        await expect(
          provider.suggestLocators(request)
        ).rejects.toThrow(
          "OPENAI_PROVIDER_FAILED"
        );

        expect(calls).toBe(1);

        const events =
          diagnostics.getEvents();

        expect(events).toHaveLength(1);

        expect(events[0]).toMatchObject({
          provider: "openai",
          outcome: "failure",
          errorCode: "AUTHENTICATION_ERROR",
          candidateCount: 0,
          attemptCount: 1,
          retryCount: 0,
          lastRetryErrorCode: "NONE",
        });
      }
    );

    /**
     * RDG-004
     *
     * A stalled provider operation must
     * settle when the overall deadline
     * expires.
     */
    test(
      "RDG-004: timeout records actual attempt count",
      async () => {
        const diagnostics =
          new AIProviderDiagnostics();

        let calls = 0;

        const fetchImpl = (async () => {
          calls++;

          return new Promise<Response>(
            () => undefined
          );
        }) as typeof fetch;

        const provider = new OpenAIProvider(
          {
            ...openAIConfig,
            timeoutMs: 40,
          },
          {
            allowExternalRequests: true,
            fetchImpl,
            diagnostics,
            retryPolicy,
          }
        );

        await expect(
          provider.suggestLocators(request)
        ).rejects.toThrow(
          "OPENAI_PROVIDER_FAILED"
        );

        expect(calls).toBe(1);

        const events =
          diagnostics.getEvents();

        expect(events).toHaveLength(1);

        expect(events[0]).toMatchObject({
          provider: "openai",
          outcome: "failure",
          errorCode: "TIMEOUT",
          candidateCount: 0,
          attemptCount: 1,
          retryCount: 0,
          lastRetryErrorCode: "NONE",
        });
      }
    );

    /**
     * RDG-005
     *
     * Diagnostics must not retain:
     * - API keys
     * - DOM snapshots
     * - Raw request data
     * - Raw provider responses
     */
    test(
      "RDG-005: retry diagnostics exclude sensitive information",
      async () => {
        const diagnostics =
          new AIProviderDiagnostics();

        const sensitiveApiKey =
          "PRIVATE_API_KEY_12345";

        const sensitiveResponse =
          "PRIVATE_RESPONSE_SECRET_67890";

        let calls = 0;

        const fetchImpl = (async () => {
          calls++;

          if (calls === 1) {
            return httpError(503);
          }

          return openAIResponse();
        }) as typeof fetch;

        const provider = new OpenAIProvider(
          {
            ...openAIConfig,
            apiKey: sensitiveApiKey,
          },
          {
            allowExternalRequests: true,
            fetchImpl,
            diagnostics,
            retryPolicy,
          }
        );

        await provider.suggestLocators(
          request
        );

        const events =
          diagnostics.getEvents();

        expect(events).toHaveLength(1);

        const serialized =
          JSON.stringify(events);

        expect(serialized).not.toContain(
          sensitiveApiKey
        );

        expect(serialized).not.toContain(
          sensitiveResponse
        );

        expect(serialized).not.toContain(
          "domSnapshot"
        );

        expect(serialized).not.toContain(
          "#login"
        );

        expect(events[0]).toMatchObject({
          provider: "openai",
          outcome: "success",
          attemptCount: 2,
          retryCount: 1,
          lastRetryErrorCode: "HTTP_ERROR",
        });
      }
    );
  }
);

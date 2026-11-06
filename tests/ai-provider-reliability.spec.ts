
import { test, expect } from "@playwright/test";

import { AIProviderDiagnostics } from "../src/ai/AIProviderDiagnostics";
import { OpenAIProvider } from "../src/ai/OpenAIProvider";
import { GeminiProvider } from "../src/ai/GeminiProvider";
import { createAIProvider } from "../src/ai/AIProviderFactory";
import { createRuntimeAIProvider } from "../src/ai/AIRuntimeFactory";

import type { AILocatorRequest } from "../src/ai/AIProvider";
import type { ProductionAIConfig } from "../src/ai/ProductionAIConfig";
import type { GeminiAIConfig } from "../src/ai/GeminiAIConfig";
import type { AIRuntimeConfig } from "../src/ai/AIRuntimeConfig";
import type { AIProviderRetryPolicy } from "../src/ai/AIProviderRetryPolicy";

/**
 * AutoHeal QA
 * Phase 4.0.8 - AI Provider Reliability Integration
 *
 * Tests: REL-001 to REL-012
 *
 * All HTTP requests are mocked.
 * No external AI requests are performed.
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

const retryPolicy: AIProviderRetryPolicy = {
  maxRetries: 2,
  baseDelayMs: 1,
  maxDelayMs: 2,
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
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

function sequenceFetch(
  steps: Array<() => Promise<Response> | Response>
): {
  fetchImpl: typeof fetch;
  getCalls: () => number;
} {
  let calls = 0;

  const fetchImpl = (async () => {
    const index = calls++;
    const step = steps[index];

    if (!step) {
      throw new Error("UNEXPECTED_MOCK_REQUEST");
    }

    return await step();
  }) as typeof fetch;

  return {
    fetchImpl,
    getCalls: () => calls,
  };
}

test.describe(
  "Phase 4.0.8 - AI Provider Reliability Integration",
  () => {
    test("REL-001: OpenAI retries HTTP 503 and succeeds", async () => {
      const mock = sequenceFetch([
        () => response({}, 503),
        () => response(openAIResponse()),
      ]);

      const diagnostics = new AIProviderDiagnostics();

      const provider = new OpenAIProvider(openAIConfig, {
        allowExternalRequests: true,
        fetchImpl: mock.fetchImpl,
        diagnostics,
        retryPolicy,
      });

      const candidates = await provider.suggestLocators(request);

      expect(candidates).toHaveLength(1);
      expect(mock.getCalls()).toBe(2);

      expect(diagnostics.getEvents()).toHaveLength(1);
      expect(diagnostics.getEvents()[0]).toMatchObject({
        provider: "openai",
        outcome: "success",
        errorCode: "NONE",
        candidateCount: 1,
      });
    });

    test("REL-002: Gemini retries HTTP 429 and succeeds", async () => {
      const mock = sequenceFetch([
        () => response({}, 429),
        () => response(geminiResponse()),
      ]);

      const diagnostics = new AIProviderDiagnostics();

      const provider = new GeminiProvider(geminiConfig, {
        allowExternalRequests: true,
        fetchImpl: mock.fetchImpl,
        diagnostics,
        retryPolicy,
      });

      const candidates = await provider.suggestLocators(request);

      expect(candidates).toHaveLength(1);
      expect(mock.getCalls()).toBe(2);

      expect(diagnostics.getEvents()).toHaveLength(1);
      expect(diagnostics.getEvents()[0]).toMatchObject({
        provider: "gemini",
        outcome: "success",
        errorCode: "NONE",
        candidateCount: 1,
      });
    });

    test("REL-003: OpenAI does not retry HTTP 401", async () => {
      const mock = sequenceFetch([
        () => response({}, 401),
      ]);

      const diagnostics = new AIProviderDiagnostics();

      const provider = new OpenAIProvider(openAIConfig, {
        allowExternalRequests: true,
        fetchImpl: mock.fetchImpl,
        diagnostics,
        retryPolicy,
      });

      await expect(
        provider.suggestLocators(request)
      ).rejects.toThrow("OPENAI_PROVIDER_FAILED");

      expect(mock.getCalls()).toBe(1);
      expect(diagnostics.getEvents()).toHaveLength(1);
      expect(diagnostics.getEvents()[0].errorCode).toBe(
        "AUTHENTICATION_ERROR"
      );
    });

    test("REL-004: Gemini does not retry malformed response", async () => {
      const mock = sequenceFetch([
        () => response({ invalid: true }),
      ]);

      const diagnostics = new AIProviderDiagnostics();

      const provider = new GeminiProvider(geminiConfig, {
        allowExternalRequests: true,
        fetchImpl: mock.fetchImpl,
        diagnostics,
        retryPolicy,
      });

      await expect(
        provider.suggestLocators(request)
      ).rejects.toThrow("GEMINI_PROVIDER_FAILED");

      expect(mock.getCalls()).toBe(1);
      expect(diagnostics.getEvents()).toHaveLength(1);
      expect(diagnostics.getEvents()[0].errorCode).toBe(
        "INVALID_RESPONSE"
      );
    });

    test("REL-005: OpenAI enforces maximum retry count", async () => {
      const mock = sequenceFetch([
        () => response({}, 503),
        () => response({}, 503),
        () => response({}, 503),
      ]);

      const diagnostics = new AIProviderDiagnostics();

      const provider = new OpenAIProvider(openAIConfig, {
        allowExternalRequests: true,
        fetchImpl: mock.fetchImpl,
        diagnostics,
        retryPolicy,
      });

      await expect(
        provider.suggestLocators(request)
      ).rejects.toThrow("OPENAI_PROVIDER_FAILED");

      expect(mock.getCalls()).toBe(3);
      expect(diagnostics.getEvents()).toHaveLength(1);
      expect(diagnostics.getEvents()[0]).toMatchObject({
        outcome: "failure",
        errorCode: "HTTP_ERROR",
        candidateCount: 0,
      });
    });

    test("REL-006: Gemini retries network failure", async () => {
      const mock = sequenceFetch([
        () => Promise.reject(new TypeError("Mock network failure")),
        () => response(geminiResponse()),
      ]);

      const diagnostics = new AIProviderDiagnostics();

      const provider = new GeminiProvider(geminiConfig, {
        allowExternalRequests: true,
        fetchImpl: mock.fetchImpl,
        diagnostics,
        retryPolicy,
      });

      const candidates = await provider.suggestLocators(request);

      expect(candidates).toHaveLength(1);
      expect(mock.getCalls()).toBe(2);
      expect(diagnostics.getEvents()).toHaveLength(1);
      expect(diagnostics.getEvents()[0].outcome).toBe("success");
    });

    test("REL-007: OpenAI timeout includes retry backoff", async () => {
      const mock = sequenceFetch([
        () => response({}, 503),
      ]);

      const diagnostics = new AIProviderDiagnostics();

      const provider = new OpenAIProvider(
        {
          ...openAIConfig,
          timeoutMs: 30,
        },
        {
          allowExternalRequests: true,
          fetchImpl: mock.fetchImpl,
          diagnostics,
          retryPolicy: {
            maxRetries: 2,
            baseDelayMs: 100,
            maxDelayMs: 200,
          },
        }
      );

      await expect(
        provider.suggestLocators(request)
      ).rejects.toThrow("OPENAI_PROVIDER_FAILED");

      expect(mock.getCalls()).toBe(1);
      expect(diagnostics.getEvents()).toHaveLength(1);
      expect(diagnostics.getEvents()[0].errorCode).toBe("TIMEOUT");
    });

    test("REL-008: Gemini late response cannot change timeout", async () => {
      let resolveFetch!: (value: Response) => void;
      let calls = 0;

      const fetchImpl = (async () => {
        calls++;

        return new Promise<Response>(resolve => {
          resolveFetch = resolve;
        });
      }) as typeof fetch;

      const diagnostics = new AIProviderDiagnostics();

      const provider = new GeminiProvider(
        {
          ...geminiConfig,
          timeoutMs: 30,
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
      ).rejects.toThrow("GEMINI_PROVIDER_FAILED");

      const before = diagnostics.getEvents();

      resolveFetch(response(geminiResponse()));

      await new Promise<void>(resolve => {
        setTimeout(resolve, 20);
      });

      expect(calls).toBe(1);
      expect(diagnostics.getEvents()).toEqual(before);
      expect(diagnostics.getEvents()).toHaveLength(1);
      expect(diagnostics.getEvents()[0].errorCode).toBe("TIMEOUT");
    });

    test("REL-009: OpenAI default policy disables retries", async () => {
      const mock = sequenceFetch([
        () => response({}, 503),
      ]);

      const provider = new OpenAIProvider(openAIConfig, {
        allowExternalRequests: true,
        fetchImpl: mock.fetchImpl,
      });

      await expect(
        provider.suggestLocators(request)
      ).rejects.toThrow("OPENAI_PROVIDER_FAILED");

      expect(mock.getCalls()).toBe(1);
    });

    test("REL-010: AIProviderFactory forwards retry policy", async () => {
      const mock = sequenceFetch([
        () => response({}, 503),
        () => response(openAIResponse()),
      ]);

      const provider = createAIProvider("openai", {
        allowExternalRequests: true,
        config: openAIConfig,
        fetchImpl: mock.fetchImpl,
        retryPolicy,
      });

      expect(provider).not.toBeNull();

      const candidates = await provider!.suggestLocators(request);

      expect(candidates).toHaveLength(1);
      expect(mock.getCalls()).toBe(2);
    });

    test("REL-011: AIRuntimeFactory forwards retry policy", async () => {
      const mock = sequenceFetch([
        () => response({}, 429),
        () => response(geminiResponse()),
      ]);

      const runtime = {
        recoveryEnabled: true,
        provider: "gemini",
        allowExternalRequests: true,
        allowProductionEnvironment: false,
        testEnvironment: "development",
      } as AIRuntimeConfig;

      const provider = createRuntimeAIProvider(runtime, {
        geminiConfig,
        fetchImpl: mock.fetchImpl,
        retryPolicy,
      });

      expect(provider).not.toBeNull();

      const candidates = await provider!.suggestLocators(request);

      expect(candidates).toHaveLength(1);
      expect(mock.getCalls()).toBe(2);
    });

    test("REL-012: Diagnostics record only final retry failure", async () => {
      const mock = sequenceFetch([
        () => response({}, 429),
        () => response({}, 429),
        () => response({}, 429),
      ]);

      const diagnostics = new AIProviderDiagnostics();

      const provider = new GeminiProvider(geminiConfig, {
        allowExternalRequests: true,
        fetchImpl: mock.fetchImpl,
        diagnostics,
        retryPolicy,
      });

      await expect(
        provider.suggestLocators(request)
      ).rejects.toThrow("GEMINI_PROVIDER_FAILED");

      expect(mock.getCalls()).toBe(3);
      expect(diagnostics.getEvents()).toHaveLength(1);

      expect(diagnostics.getEvents()[0]).toMatchObject({
        provider: "gemini",
        outcome: "failure",
        errorCode: "RATE_LIMITED",
        candidateCount: 0,
      });
    });
  }
);

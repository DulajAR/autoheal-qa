
import { test, expect } from "@playwright/test";

import { createRuntimeAIProvider } from "../../src/ai/AIRuntimeFactory";
import { loadAIRuntimeConfig } from "../../src/ai/AIRuntimeConfig";

import type { ProductionAIConfig } from "../../src/ai/ProductionAIConfig";
import type { AILocatorRequest } from "../../src/ai/AIProvider";

// ============================================================
// Phase 4.0.6C - OpenAI Provider Smoke Tests
//
// AI-SMOKE-001: Mocked API response
// AI-SMOKE-002: Unauthorized request rejection
// AI-SMOKE-003: Optional live API verification
// AI-SMOKE-004: Malformed API response rejection
// AI-SMOKE-005: Provider timeout handling
//
// IMPORTANT:
// - Normal tests never contact the real OpenAI API.
// - Live requests require explicit authorization.
// - Live requests are disabled in CI.
// - AI-generated selectors remain advisory only.
// ============================================================

// Explicit opt-in is required for real API calls.
const LIVE =
  process.env.RUN_LIVE_AI_SMOKE === "true" &&
  process.env.CI !== "true";

// ------------------------------------------------------------
// Shared test data
// ------------------------------------------------------------

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

// Dummy credentials used exclusively with mocked fetch.
const mockConfig: ProductionAIConfig = {
  apiKey: "mock-test-key",
  model: "gpt-4.1-mini",
  timeoutMs: 3000,
  maxOutputTokens: 300,
};

// Authorized development runtime for mock testing.
const mockRuntime = {
  provider: "openai" as const,
  testEnvironment: "development" as const,
  recoveryEnabled: true,
  allowExternalRequests: true,
  allowProductionEnvironment: false,
};

// ============================================================
// AI-SMOKE-001
// Mocked OpenAI response works
// ============================================================

test("AI-SMOKE-001: mocked OpenAI response works", async () => {
  let requestCount = 0;

  const mockFetch: typeof fetch = async (_input, init) => {
    requestCount++;

    expect(init?.method).toBe("POST");

    const body = JSON.parse(String(init?.body));

    // Validate the configured model.
    expect(body.model).toBe("gpt-4.1-mini");

    // Verify request is sent in JSON format.
    expect(body.response_format).toEqual({
      type: "json_object",
    });

    // Sensitive page context must not be included.
    expect(JSON.stringify(body)).not.toContain(
      "https://example.com"
    );

    // Simulated OpenAI API response.
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

  const provider = createRuntimeAIProvider(mockRuntime, {
    productionConfig: mockConfig,
    fetchImpl: mockFetch,
  });

  expect(provider).not.toBeNull();

  const candidates = await provider!.suggestLocators(request);

  // Only one mocked request should occur.
  expect(requestCount).toBe(1);

  // Verify parsed AI suggestions.
  expect(candidates).toEqual([
    {
      selector: "#new-submit",
      confidence: 0.95,
    },
  ]);
});

// ============================================================
// AI-SMOKE-002
// Unauthorized external requests must be rejected
// ============================================================

test("AI-SMOKE-002: unauthorized requests are blocked", () => {
  expect(() =>
    createRuntimeAIProvider({
      provider: "openai",
      testEnvironment: "development",
      recoveryEnabled: true,

      // Explicitly deny external API requests.
      allowExternalRequests: false,

      allowProductionEnvironment: false,
    })
  ).toThrow("EXTERNAL_AI_NOT_AUTHORIZED");
});

// ============================================================
// AI-SMOKE-003
// Optional live OpenAI API request
//
// This test is excluded from the standard mock test command.
// It must never run in CI.
// ============================================================

test("AI-SMOKE-003: optional live OpenAI request", async () => {
  test.skip(
    !LIVE,
    "Live API requests require explicit local authorization"
  );

  // Defense-in-depth: reject CI execution.
  expect(process.env.CI).not.toBe("true");

  const runtime = loadAIRuntimeConfig();

  // Strict runtime authorization.
  expect(runtime.provider).toBe("openai");

  expect(runtime.testEnvironment).toBe("development");

  expect(runtime.recoveryEnabled).toBe(true);

  expect(runtime.allowExternalRequests).toBe(true);

  expect(runtime.allowProductionEnvironment).toBe(false);

  // This creates the actual production provider.
  // API credentials are read from the environment.
  const provider = createRuntimeAIProvider(runtime);

  expect(provider).not.toBeNull();

  // This is the only test capable of making a real API call.
  const candidates = await provider!.suggestLocators(request);

  // Validate response structure.
  expect(Array.isArray(candidates)).toBe(true);

  expect(candidates.length).toBeLessThanOrEqual(5);

  for (const candidate of candidates) {
    expect(typeof candidate.selector).toBe("string");

    expect(candidate.selector.length).toBeGreaterThan(0);

    expect(candidate.confidence).toBeGreaterThanOrEqual(0);

    expect(candidate.confidence).toBeLessThanOrEqual(1);
  }

  // Advisory only.
  // Never execute or click AI-generated selectors.
  console.log("LIVE_AI_SMOKE_COMPLETED");

  console.log("Candidate count:", candidates.length);
});

// ============================================================
// AI-SMOKE-004
// Malformed OpenAI responses must fail safely
// ============================================================

test("AI-SMOKE-004: malformed AI response is rejected", async () => {
  let requestCount = 0;

  const mockFetch: typeof fetch = async () => {
    requestCount++;

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: "invalid-json",
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

  const provider = createRuntimeAIProvider(mockRuntime, {
    productionConfig: mockConfig,
    fetchImpl: mockFetch,
  });

  expect(provider).not.toBeNull();

  await expect(
    provider!.suggestLocators(request)
  ).rejects.toThrow("OPENAI_PROVIDER_FAILED");

  expect(requestCount).toBe(1);
});

// ============================================================
// AI-SMOKE-005
// Provider timeout must fail safely
// ============================================================

test("AI-SMOKE-005: provider timeout is handled safely", async () => {
  let requestCount = 0;
  let requestAborted = false;

  // Simulate a network request that never completes
  // until its AbortSignal is triggered.
  const mockFetch: typeof fetch = async (_input, init) => {
    requestCount++;

    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;

      if (!signal) {
        reject(new Error("Missing AbortSignal"));
        return;
      }

      if (signal.aborted) {
        requestAborted = true;
        reject(new Error("Request aborted"));
        return;
      }

      signal.addEventListener(
        "abort",
        () => {
          requestAborted = true;
          reject(new Error("Request aborted"));
        },
        { once: true }
      );
    });
  };

  const provider = createRuntimeAIProvider(mockRuntime, {
    productionConfig: {
      ...mockConfig,

      // Short timeout to keep this test fast.
      timeoutMs: 100,
    },
    fetchImpl: mockFetch,
  });

  expect(provider).not.toBeNull();

  await expect(
    provider!.suggestLocators(request)
  ).rejects.toThrow("OPENAI_PROVIDER_FAILED");

  expect(requestCount).toBe(1);

  // The provider must abort the timed-out request.
  expect(requestAborted).toBe(true);
});

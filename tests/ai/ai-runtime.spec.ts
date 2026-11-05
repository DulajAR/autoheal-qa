
import { test, expect } from "@playwright/test";

import {
  loadAIRuntimeConfig,
} from "../../src/ai/AIRuntimeConfig";

import {
  createRuntimeAIProvider,
} from "../../src/ai/AIRuntimeFactory";

import { MockAIProvider } from "../../src/ai/MockAIProvider";
import { OpenAIProvider } from "../../src/ai/OpenAIProvider";

import type {
  ProductionAIConfig,
} from "../../src/ai/ProductionAIConfig";

const testConfig: ProductionAIConfig = {
  apiKey: "test-key-not-real",
  model: "test-model",
  timeoutMs: 1000,
  maxOutputTokens: 300,
};

function runtime(
  overrides: Record<string, string> = {}
) {
  return loadAIRuntimeConfig({
    AI_PROVIDER: "openai",
    TEST_ENV: "development",
    AI_RECOVERY_ENABLED: "true",
    AI_ALLOW_EXTERNAL_REQUESTS: "true",
    ...overrides,
  });
}

test.describe("AI Runtime Security", () => {
  test("RUN-001: disabled by default", () => {
    const config = loadAIRuntimeConfig({});

    expect(config.provider).toBe("disabled");
    expect(config.recoveryEnabled).toBe(false);
    expect(config.allowExternalRequests).toBe(false);

    expect(
      createRuntimeAIProvider(config)
    ).toBeNull();
  });

  test("RUN-002: mock provider works offline", () => {
    const config = loadAIRuntimeConfig({
      AI_PROVIDER: "mock",
      AI_RECOVERY_ENABLED: "true",
    });

    expect(
      createRuntimeAIProvider(config)
    ).toBeInstanceOf(MockAIProvider);
  });

  test("RUN-003: rejects unauthorized OpenAI", () => {
    expect(() =>
      createRuntimeAIProvider(
        runtime({
          AI_ALLOW_EXTERNAL_REQUESTS: "false",
        })
      )
    ).toThrow("EXTERNAL_AI_NOT_AUTHORIZED");
  });

  test("RUN-004: rejects demo environment", () => {
    expect(() =>
      createRuntimeAIProvider(
        runtime({ TEST_ENV: "demo" })
      )
    ).toThrow("AI_ENVIRONMENT_NOT_ALLOWED");
  });

  test("RUN-005: rejects production by default", () => {
    expect(() =>
      createRuntimeAIProvider(
        runtime({ TEST_ENV: "production" })
      )
    ).toThrow("PRODUCTION_AI_NOT_AUTHORIZED");
  });

  test("RUN-006: allows authorized development provider", () => {
    let calls = 0;

    const provider = createRuntimeAIProvider(
      runtime(),
      {
        productionConfig: testConfig,
        fetchImpl: async () => {
          calls++;
          throw new Error("Unexpected network request");
        },
      }
    );

    expect(provider).toBeInstanceOf(OpenAIProvider);
    expect(calls).toBe(0);
  });

  test("RUN-007: rejects invalid boolean configuration", () => {
    expect(() =>
      loadAIRuntimeConfig({
        AI_ALLOW_EXTERNAL_REQUESTS: "yes",
      })
    ).toThrow("INVALID_AI_ALLOW_EXTERNAL_REQUESTS");
  });

  test("RUN-008: rejects unknown provider", () => {
    expect(() =>
      loadAIRuntimeConfig({
        AI_PROVIDER: "unknown",
      })
    ).toThrow("INVALID_AI_PROVIDER");
  });

  test("RUN-009: disabled recovery creates no provider", () => {
    const provider = createRuntimeAIProvider(
      runtime({
        AI_RECOVERY_ENABLED: "false",
      })
    );

    expect(provider).toBeNull();
  });

  test("RUN-010: production requires both approvals", () => {
    const provider = createRuntimeAIProvider(
      runtime({
        TEST_ENV: "production",
        AI_ALLOW_PRODUCTION_ENVIRONMENT: "true",
      }),
      {
        productionConfig: testConfig,
        fetchImpl: async () => {
          throw new Error("Unexpected network request");
        },
      }
    );

    expect(provider).toBeInstanceOf(OpenAIProvider);
  });
});

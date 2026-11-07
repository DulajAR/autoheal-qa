
import { test, expect } from "@playwright/test";

import {
  createAIProvider,
} from "../../src/ai/AIProviderFactory";

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

test.describe("Production AI Provider Factory", () => {
  test("FAC-001: disabled provider returns null", () => {
    expect(
      createAIProvider("disabled")
    ).toBeNull();
  });

  test("FAC-002: mock provider remains supported", () => {
    const provider = createAIProvider("mock");

    expect(provider).toBeInstanceOf(MockAIProvider);
  });

  test("FAC-003: OpenAI requires authorization", () => {
    expect(() =>
      createAIProvider("openai")
    ).toThrow("EXTERNAL_AI_NOT_AUTHORIZED");
  });

  test("FAC-004: explicit authorization creates OpenAI provider", () => {
    const provider = createAIProvider("openai", {
      allowExternalRequests: true,
      config: testConfig,
      fetchImpl: async () => {
        throw new Error(
          "Network requests must not occur"
        );
      },
    });

    expect(provider).toBeInstanceOf(OpenAIProvider);
    expect(provider?.name).toBe("openai");
  });

  test("FAC-005: unsupported providers are rejected", () => {
    expect(() =>
      createAIProvider(
        "unknown" as "disabled"
      )
    ).toThrow("UNSUPPORTED_AI_PROVIDER");
  });
});

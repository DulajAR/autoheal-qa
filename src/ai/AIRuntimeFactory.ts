
import type {
  AIProvider,
} from "./AIProvider";

import {
  createAIProvider,
} from "./AIProviderFactory";

import type {
  AIRuntimeConfig,
} from "./AIRuntimeConfig";

import type {
  ProductionAIConfig,
} from "./ProductionAIConfig";

import type {
  GeminiAIConfig,
} from "./GeminiAIConfig";

/**
 * AutoHeal QA
 * Phase 4.0.6D - AI Runtime Factory
 *
 * Supports:
 * - Disabled provider
 * - Mock provider
 * - OpenAI provider
 * - Google Gemini provider
 *
 * Security:
 * - AI recovery must be enabled explicitly
 * - External requests must be authorized
 * - Demo environment cannot use cloud AI
 * - Production requires additional authorization
 * - Provider creation makes no API requests
 */

export type AIRuntimeFactoryOptions = {
  // Existing OpenAI configuration.
  productionConfig?: ProductionAIConfig;

  // New Google Gemini configuration.
  geminiConfig?: GeminiAIConfig;

  // Injectable fetch implementation for testing.
  fetchImpl?: typeof fetch;
};

/**
 * Create an AI provider using validated runtime settings.
 *
 * This function does not send API requests.
 * Providers return locator suggestions only.
 */
export function createRuntimeAIProvider(
  runtime: AIRuntimeConfig,
  options: AIRuntimeFactoryOptions = {}
): AIProvider | null {
  // AI recovery is disabled by default.
  if (
    !runtime.recoveryEnabled ||
    runtime.provider === "disabled"
  ) {
    return null;
  }

  // Mock provider is safe for offline tests.
  if (runtime.provider === "mock") {
    return createAIProvider("mock");
  }

  // Only supported cloud providers may continue.
  if (
    runtime.provider !== "openai" &&
    runtime.provider !== "gemini"
  ) {
    throw new Error(
      "UNSUPPORTED_AI_PROVIDER"
    );
  }

  // Explicit authorization is required.
  if (!runtime.allowExternalRequests) {
    throw new Error(
      "EXTERNAL_AI_NOT_AUTHORIZED"
    );
  }

  // Production requires additional authorization.
  if (
    runtime.testEnvironment === "production" &&
    !runtime.allowProductionEnvironment
  ) {
    throw new Error(
      "PRODUCTION_AI_NOT_AUTHORIZED"
    );
  }

  // Cloud AI is not allowed in the demo environment.
  if (
    runtime.testEnvironment !== "development" &&
    runtime.testEnvironment !== "staging" &&
    runtime.testEnvironment !== "production"
  ) {
    throw new Error(
      "AI_ENVIRONMENT_NOT_ALLOWED"
    );
  }

  // Preserve existing OpenAI integration.
  if (runtime.provider === "openai") {
    return createAIProvider("openai", {
      allowExternalRequests: true,
      config: options.productionConfig,
      fetchImpl: options.fetchImpl,
    });
  }

  // Google Gemini integration.
  return createAIProvider("gemini", {
    allowExternalRequests: true,
    geminiConfig: options.geminiConfig,
    fetchImpl: options.fetchImpl,
  });
}

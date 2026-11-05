
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

import type {
  AIProviderDiagnostics,
} from "./AIProviderDiagnostics";

/**
 * AutoHeal QA
 * Phase 4.0.7 - AI Runtime Factory
 *
 * Security:
 * - Recovery must be enabled
 * - External requests require authorization
 * - Demo environment blocks cloud AI
 * - Production requires additional approval
 * - No API calls during construction
 */

export type AIRuntimeFactoryOptions = {
  productionConfig?: ProductionAIConfig;
  geminiConfig?: GeminiAIConfig;
  fetchImpl?: typeof fetch;
  diagnostics?: AIProviderDiagnostics;
};

export function createRuntimeAIProvider(
  runtime: AIRuntimeConfig,
  options: AIRuntimeFactoryOptions = {}
): AIProvider | null {
  if (
    !runtime.recoveryEnabled ||
    runtime.provider === "disabled"
  ) {
    return null;
  }

  if (runtime.provider === "mock") {
    return createAIProvider("mock");
  }

  if (
    runtime.provider !== "openai" &&
    runtime.provider !== "gemini"
  ) {
    throw new Error(
      "UNSUPPORTED_AI_PROVIDER"
    );
  }

  if (!runtime.allowExternalRequests) {
    throw new Error(
      "EXTERNAL_AI_NOT_AUTHORIZED"
    );
  }

  if (
    runtime.testEnvironment === "production" &&
    !runtime.allowProductionEnvironment
  ) {
    throw new Error(
      "PRODUCTION_AI_NOT_AUTHORIZED"
    );
  }

  if (
    runtime.testEnvironment !== "development" &&
    runtime.testEnvironment !== "staging" &&
    runtime.testEnvironment !== "production"
  ) {
    throw new Error(
      "AI_ENVIRONMENT_NOT_ALLOWED"
    );
  }

  if (runtime.provider === "openai") {
    return createAIProvider("openai", {
      allowExternalRequests: true,
      config: options.productionConfig,
      fetchImpl: options.fetchImpl,
      diagnostics: options.diagnostics,
    });
  }

  return createAIProvider("gemini", {
    allowExternalRequests: true,
    geminiConfig: options.geminiConfig,
    fetchImpl: options.fetchImpl,
    diagnostics: options.diagnostics,
  });
}

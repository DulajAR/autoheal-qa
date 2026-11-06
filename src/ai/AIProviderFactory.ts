
import type {
  AIProvider,
} from "./AIProvider";

import {
  MockAIProvider,
} from "./MockAIProvider";

import {
  OpenAIProvider,
} from "./OpenAIProvider";

import {
  GeminiProvider,
} from "./GeminiProvider";

import {
  loadProductionAIConfig,
} from "./ProductionAIConfig";

import type {
  ProductionAIConfig,
} from "./ProductionAIConfig";

import {
  loadGeminiAIConfig,
} from "./GeminiAIConfig";

import type {
  GeminiAIConfig,
} from "./GeminiAIConfig";

import type {
  AIProviderDiagnostics,
} from "./AIProviderDiagnostics";

import type {
  AIProviderRetryPolicy,
} from "./AIProviderRetryPolicy";

/**
 * AutoHeal QA
 * Phase 4.0.8 - AI Provider Factory
 *
 * Security:
 * - Explicit authorization required
 * - No external calls during construction
 * - Production providers tracked securely
 * - Optional diagnostics
 * - Optional retry policy
 * - Retries disabled by default
 */

export type AIProviderType =
  | "disabled"
  | "mock"
  | "openai"
  | "gemini";

export type AIProviderFactoryOptions = {
  allowExternalRequests?: boolean;
  config?: ProductionAIConfig;
  geminiConfig?: GeminiAIConfig;
  fetchImpl?: typeof fetch;
  diagnostics?: AIProviderDiagnostics;
  retryPolicy?: AIProviderRetryPolicy;
};

const authorizedProviders =
  new WeakSet<AIProvider>();

export function isAuthorizedProductionProvider(
  provider: AIProvider
): boolean {
  return (
    (
      provider instanceof OpenAIProvider ||
      provider instanceof GeminiProvider
    ) &&
    authorizedProviders.has(provider)
  );
}

export function createAIProvider(
  providerType: AIProviderType,
  options: AIProviderFactoryOptions = {}
): AIProvider | null {
  switch (providerType) {
    case "disabled":
      return null;

    case "mock":
      return new MockAIProvider();

    case "openai": {
      if (
        options.allowExternalRequests !== true
      ) {
        throw new Error(
          "EXTERNAL_AI_NOT_AUTHORIZED"
        );
      }

      const config =
        options.config ??
        loadProductionAIConfig();

      const provider =
        new OpenAIProvider(config, {
          allowExternalRequests: true,
          fetchImpl: options.fetchImpl,
          diagnostics: options.diagnostics,
          retryPolicy: options.retryPolicy,
        });

      authorizedProviders.add(provider);

      return provider;
    }

    case "gemini": {
      if (
        options.allowExternalRequests !== true
      ) {
        throw new Error(
          "EXTERNAL_AI_NOT_AUTHORIZED"
        );
      }

      const config =
        options.geminiConfig ??
        loadGeminiAIConfig();

      const provider =
        new GeminiProvider(config, {
          allowExternalRequests: true,
          fetchImpl: options.fetchImpl,
          diagnostics: options.diagnostics,
          retryPolicy: options.retryPolicy,
        });

      authorizedProviders.add(provider);

      return provider;
    }

    default:
      throw new Error(
        "UNSUPPORTED_AI_PROVIDER"
      );
  }
}

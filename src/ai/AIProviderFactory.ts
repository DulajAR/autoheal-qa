
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

/**
 * AutoHeal QA
 * Phase 4.0.6D - Multi-Provider AI Factory
 *
 * Supported providers:
 * - disabled
 * - mock
 * - openai
 * - gemini
 *
 * Security:
 * - External providers require explicit authorization
 * - No API calls are made during provider creation
 * - Production providers are tracked using WeakSet
 * - Existing OpenAI compatibility is preserved
 */

export type AIProviderType =
  | "disabled"
  | "mock"
  | "openai"
  | "gemini";

export type AIProviderFactoryOptions = {
  allowExternalRequests?: boolean;

  // Existing OpenAI configuration.
  config?: ProductionAIConfig;

  // New Gemini configuration.
  geminiConfig?: GeminiAIConfig;

  // Injectable fetch implementation for mock tests.
  fetchImpl?: typeof fetch;
};

/**
 * Tracks cloud AI providers constructed
 * with explicit authorization.
 */
const authorizedProviders =
  new WeakSet<AIProvider>();

/**
 * Check whether a provider was created through
 * this factory with external access authorized.
 */
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

/**
 * Create an AI provider.
 *
 * Creating a provider does not make an API call.
 * Network access only occurs if suggestLocators()
 * is explicitly invoked on an authorized provider.
 */
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

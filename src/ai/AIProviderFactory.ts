
import type { AIProvider } from "./AIProvider";
import { MockAIProvider } from "./MockAIProvider";
import { OpenAIProvider } from "./OpenAIProvider";

import {
  loadProductionAIConfig,
} from "./ProductionAIConfig";

import type {
  ProductionAIConfig,
} from "./ProductionAIConfig";

export type AIProviderType =
  | "disabled"
  | "mock"
  | "openai";

export type AIProviderFactoryOptions = {
  allowExternalRequests?: boolean;
  config?: ProductionAIConfig;
  fetchImpl?: typeof fetch;
};

// Tracks production providers constructed through
// this factory with explicit authorization.
const authorizedProviders = new WeakSet<AIProvider>();

export function isAuthorizedProductionProvider(
  provider: AIProvider
): boolean {
  return (
    provider instanceof OpenAIProvider &&
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
      if (options.allowExternalRequests !== true) {
        throw new Error(
          "EXTERNAL_AI_NOT_AUTHORIZED"
        );
      }

      const config =
        options.config ?? loadProductionAIConfig();

      const provider = new OpenAIProvider(config, {
        allowExternalRequests: true,
        fetchImpl: options.fetchImpl,
      });

      authorizedProviders.add(provider);

      return provider;
    }

    default:
      throw new Error("UNSUPPORTED_AI_PROVIDER");
  }
}

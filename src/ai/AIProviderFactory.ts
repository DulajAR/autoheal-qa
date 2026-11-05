
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

      return new OpenAIProvider(config, {
        allowExternalRequests: true,
        fetchImpl: options.fetchImpl,
      });
    }

    default:
      throw new Error(
        "UNSUPPORTED_AI_PROVIDER"
      );
  }
}

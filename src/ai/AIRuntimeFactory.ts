
import type { AIProvider } from "./AIProvider";

import {
  createAIProvider,
} from "./AIProviderFactory";

import type {
  AIRuntimeConfig,
} from "./AIRuntimeConfig";

import type {
  ProductionAIConfig,
} from "./ProductionAIConfig";

export type AIRuntimeFactoryOptions = {
  productionConfig?: ProductionAIConfig;
  fetchImpl?: typeof fetch;
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

  if (runtime.provider !== "openai") {
    throw new Error("UNSUPPORTED_AI_PROVIDER");
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

  return createAIProvider("openai", {
    allowExternalRequests: true,
    config: options.productionConfig,
    fetchImpl: options.fetchImpl,
  });
}

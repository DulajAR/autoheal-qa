
import type {
  AIProviderType,
} from "./AIProviderFactory";

/**
 * AutoHeal QA
 * Phase 4.0.6D - AI Runtime Configuration
 *
 * Supported AI providers:
 * - disabled
 * - mock
 * - openai
 * - gemini
 *
 * Security:
 * - AI is disabled by default
 * - External requests are disabled by default
 * - Production AI access requires explicit authorization
 * - Invalid environment variables are rejected
 * - No API requests are performed here
 */

export type AIRuntimeEnvironment =
  | "demo"
  | "development"
  | "staging"
  | "production";

export type AIRuntimeConfig = {
  provider: AIProviderType;

  testEnvironment: AIRuntimeEnvironment;

  recoveryEnabled: boolean;

  allowExternalRequests: boolean;

  allowProductionEnvironment: boolean;
};

/**
 * Strictly parse boolean environment variables.
 *
 * Only "true" and "false" are accepted.
 * Missing values default to false.
 */
function readBoolean(
  value: string | undefined,
  name: string
): boolean {
  if (
    value === undefined ||
    value === ""
  ) {
    return false;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error(`INVALID_${name}`);
}

/**
 * Load and validate AI runtime configuration.
 *
 * Defaults:
 * AI_PROVIDER=disabled
 * AI_RECOVERY_ENABLED=false
 * AI_ALLOW_EXTERNAL_REQUESTS=false
 * AI_ALLOW_PRODUCTION_ENVIRONMENT=false
 * TEST_ENV=demo
 */
export function loadAIRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env
): AIRuntimeConfig {
  const provider =
    env.AI_PROVIDER ?? "disabled";

  if (
    provider !== "disabled" &&
    provider !== "mock" &&
    provider !== "openai" &&
    provider !== "gemini"
  ) {
    throw new Error(
      "INVALID_AI_PROVIDER"
    );
  }

  const testEnvironment =
    env.TEST_ENV ?? "demo";

  if (
    testEnvironment !== "demo" &&
    testEnvironment !== "development" &&
    testEnvironment !== "staging" &&
    testEnvironment !== "production"
  ) {
    throw new Error(
      "INVALID_TEST_ENV"
    );
  }

  return {
    provider,
    testEnvironment,

    recoveryEnabled: readBoolean(
      env.AI_RECOVERY_ENABLED,
      "AI_RECOVERY_ENABLED"
    ),

    allowExternalRequests: readBoolean(
      env.AI_ALLOW_EXTERNAL_REQUESTS,
      "AI_ALLOW_EXTERNAL_REQUESTS"
    ),

    allowProductionEnvironment: readBoolean(
      env.AI_ALLOW_PRODUCTION_ENVIRONMENT,
      "AI_ALLOW_PRODUCTION_ENVIRONMENT"
    ),
  };
}

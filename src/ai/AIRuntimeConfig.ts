
import type { AIProviderType } from "./AIProviderFactory";

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

function readBoolean(
  value: string | undefined,
  name: string
): boolean {
  if (value === undefined || value === "") {
    return false;
  }

  if (value === "true") return true;
  if (value === "false") return false;

  throw new Error(`INVALID_${name}`);
}

export function loadAIRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env
): AIRuntimeConfig {
  const provider = env.AI_PROVIDER ?? "disabled";

  if (
    provider !== "disabled" &&
    provider !== "mock" &&
    provider !== "openai"
  ) {
    throw new Error("INVALID_AI_PROVIDER");
  }

  const testEnvironment =
    env.TEST_ENV ?? "demo";

  if (
    testEnvironment !== "demo" &&
    testEnvironment !== "development" &&
    testEnvironment !== "staging" &&
    testEnvironment !== "production"
  ) {
    throw new Error("INVALID_TEST_ENV");
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

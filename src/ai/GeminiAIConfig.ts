
/**
 * AutoHeal QA
 * Phase 4.0.6D - Google Gemini Configuration
 *
 * Loads and validates Gemini configuration.
 *
 * Security:
 * - No hardcoded API keys
 * - Strict model validation
 * - Bounded request timeout
 * - Bounded output tokens
 * - No network requests
 */

export type GeminiAIConfig = {
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
};

/**
 * Read a bounded integer environment variable.
 */
function readInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string
): number {
  if (
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    throw new Error(`INVALID_${name}`);
  }

  return parsed;
}

/**
 * Load Gemini configuration from environment variables.
 *
 * Configuration is validated only when this
 * function is explicitly called.
 *
 * No API request is performed here.
 */
export function loadGeminiAIConfig(
  env: NodeJS.ProcessEnv = process.env
): GeminiAIConfig {
  const apiKey =
    env.GEMINI_API_KEY?.trim();

  if (
    !apiKey ||
    /[\r\n]/.test(apiKey)
  ) {
    throw new Error(
      "INVALID_GEMINI_API_KEY"
    );
  }

  const model =
    env.GEMINI_MODEL?.trim();

  if (
    !model ||
    !/^[a-zA-Z0-9._-]{1,100}$/.test(model)
  ) {
    throw new Error(
      "INVALID_GEMINI_MODEL"
    );
  }

  const timeoutMs = readInteger(
    env.GEMINI_TIMEOUT_MS,
    5000,
    1,
    10000,
    "GEMINI_TIMEOUT_MS"
  );

  const maxOutputTokens = readInteger(
    env.GEMINI_MAX_OUTPUT_TOKENS,
    512,
    1,
    2048,
    "GEMINI_MAX_OUTPUT_TOKENS"
  );

  return {
    apiKey,
    model,
    timeoutMs,
    maxOutputTokens,
  };
}

export type ProductionAIConfig = {
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
};

function readInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string
): number {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    throw new Error(`Invalid ${name}`);
  }

  return parsed;
}

export function loadProductionAIConfig(
  env: NodeJS.ProcessEnv = process.env
): ProductionAIConfig {
  const apiKey = env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required");
  }

  if (/[\r\n]/.test(apiKey)) {
    throw new Error("Invalid OPENAI_API_KEY");
  }

  const model = env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";

  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(model)) {
    throw new Error("Invalid OPENAI_MODEL");
  }

  return {
    apiKey,
    model,
    timeoutMs: readInteger(
      env.OPENAI_TIMEOUT_MS,
      3000,
      1,
      10000,
      "OPENAI_TIMEOUT_MS"
    ),
    maxOutputTokens: readInteger(
      env.OPENAI_MAX_OUTPUT_TOKENS,
      300,
      1,
      1000,
      "OPENAI_MAX_OUTPUT_TOKENS"
    ),
  };
}

import "dotenv/config";

export type TestEnvironment =
  | "demo"
  | "development"
  | "staging"
  | "production";

const supportedEnvironments: TestEnvironment[] = [
  "demo",
  "development",
  "staging",
  "production",
];

function getPositiveInteger(
  name: string,
  defaultValue: number
): number {
  const raw = process.env[name];

  if (!raw) {
    return defaultValue;
  }

  const value = Number(raw);

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(
      `Invalid environment variable: ${name}. Expected a positive integer.`
    );
  }

  return value;
}

function getBoolean(
  name: string,
  defaultValue: boolean
): boolean {
  const raw = process.env[name];

  if (raw === undefined || raw === "") {
    return defaultValue;
  }

  if (raw === "true") return true;
  if (raw === "false") return false;

  throw new Error(
    `Invalid environment variable: ${name}. Use true or false.`
  );
}

function getTestEnvironment(): TestEnvironment {
  const value = process.env.TEST_ENV ?? "demo";

  if (
    !supportedEnvironments.includes(
      value as TestEnvironment
    )
  ) {
    throw new Error(
      `Unsupported TEST_ENV: ${value}. Supported: ${supportedEnvironments.join(", ")}`
    );
  }

  return value as TestEnvironment;
}

function getBaseUrl(
  testEnv: TestEnvironment
): string {
  const configuredUrl = process.env.BASE_URL;

  if (!configuredUrl && testEnv !== "demo") {
    throw new Error(
      `BASE_URL is required for TEST_ENV=${testEnv}`
    );
  }

  const rawUrl =
    configuredUrl ??
    "https://the-internet.herokuapp.com";

  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(
      "Invalid BASE_URL. Provide a valid HTTP or HTTPS URL."
    );
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(
      "BASE_URL must use HTTP or HTTPS."
    );
  }

  return url.toString().replace(/\/$/, "");
}

const testEnv = getTestEnvironment();

export const environment = {
  testEnv,

  baseUrl: getBaseUrl(testEnv),

  headless: getBoolean("HEADLESS", true),

  workers: getPositiveInteger("WORKERS", 1),

  actionTimeout: getPositiveInteger(
    "ACTION_TIMEOUT",
    10000
  ),

  testTimeout: getPositiveInteger(
    "TEST_TIMEOUT",
    60000
  ),

  selfHealingEnabled: getBoolean(
    "SELF_HEALING_ENABLED",
    false
  ),

  aiProvider: process.env.AI_PROVIDER ?? "disabled",
} as const;

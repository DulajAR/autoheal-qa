
import "dotenv/config";

function getPositiveInteger(
  name: string,
  defaultValue: number
): number {
  const raw = process.env[name];

  if (!raw) return defaultValue;

  const value = Number(raw);

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(
      `Invalid environment variable: ${name}`
    );
  }

  return value;
}

export const environment = {
  baseUrl:
    process.env.BASE_URL ??
    "https://the-internet.herokuapp.com",

  testEnv: process.env.TEST_ENV ?? "demo",

  headless: process.env.HEADLESS !== "false",

  workers: getPositiveInteger("WORKERS", 1),

  actionTimeout: getPositiveInteger(
    "ACTION_TIMEOUT",
    10000
  ),

  testTimeout: getPositiveInteger(
    "TEST_TIMEOUT",
    60000
  ),
} as const;


import {
  defineConfig,
} from "@playwright/test";

/**
 * AutoHeal QA
 * Phase 4.0.6D
 *
 * Google Gemini Mocked Smoke Test Configuration
 *
 * Security:
 * - Only runs tests/gemini
 * - Uses one worker
 * - No retries
 * - No browser required
 * - No real Gemini API requests
 * - Dedicated HTML report
 */

export default defineConfig({
  testDir: "./tests/gemini",

  testMatch: "**/*.spec.ts",

  fullyParallel: false,

  workers: 1,

  retries: 0,

  timeout: 15_000,

  expect: {
    timeout: 5_000,
  },

  reporter: [
    ["list"],
    [
      "html",
      {
        outputFolder:
          "reports/gemini-smoke",
        open: "never",
      },
    ],
  ],

  use: {
    trace: "off",
    screenshot: "off",
    video: "off",
  },
});

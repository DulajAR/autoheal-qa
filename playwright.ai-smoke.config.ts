
import { defineConfig } from "@playwright/test";

export default defineConfig({
  // Isolate AI smoke tests from the main suite
  testDir: "./tests/live-ai",
  testMatch: "**/*.spec.ts",

  // Prevent accidental parallel API requests
  fullyParallel: false,
  workers: 1,
  retries: 0,

  // Keep tests short and predictable
  timeout: 20000,

  expect: {
    timeout: 5000,
  },

  // Display test results in terminal
  reporter: [
    ["list"],
    [
      "html",
      {
        outputFolder: "reports/ai-smoke",
        open: "never",
      },
    ],
  ],

  outputDir: "test-results/ai-smoke",

  // No browser required for provider-only tests
  projects: [
    {
      name: "ai-provider-smoke",
    },
  ],
});

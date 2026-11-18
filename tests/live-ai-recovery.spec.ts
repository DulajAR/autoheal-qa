
import { test, expect } from "@playwright/test";

import { SelfHealingLocator } from "../src/core/SelfHealingLocator";
import { loadAIRuntimeConfig } from "../src/ai/AIRuntimeConfig";
import { createRuntimeAIProvider } from "../src/ai/AIRuntimeFactory";
import { AIProviderDiagnostics } from "../src/ai/AIProviderDiagnostics";

/**
 * AutoHeal QA
 * Live AI Recovery Integration Test
 *
 * Purpose:
 * - Evaluate live Gemini/OpenAI recovery.
 * - Record sanitized provider diagnostics.
 * - Verify AI recovery events.
 * - Prevent automatic execution of AI suggestions.
 *
 * Security:
 * - Explicit opt-in for live requests.
 * - Development environment only.
 * - No API keys or raw responses logged.
 * - No untrusted AI selectors executed.
 *
 * Note:
 * This is a safety test, not a test requiring
 * successful AI recovery.
 */

const liveEnabled =
  process.env.RUN_LIVE_AI_TESTS === "true";

test.describe("Live AI Recovery", () => {
  test.skip(
    !liveEnabled,
    "Live AI testing requires explicit opt-in"
  );

  test(
    "LIVE-001: evaluates real AI recovery safely",
    async ({ page }, testInfo) => {
      // 1. Validate runtime configuration.
      const runtime = loadAIRuntimeConfig();

      expect(runtime.testEnvironment).toBe(
        "development"
      );

      expect(runtime.recoveryEnabled).toBe(true);

      expect(
        runtime.allowExternalRequests
      ).toBe(true);

      expect(["openai", "gemini"]).toContain(
        runtime.provider
      );

      // 2. Initialize the existing diagnostics class.
      const diagnostics =
        new AIProviderDiagnostics();

      // 3. Create an authorized AI provider.
      // No diagnostic fetch wrapper is used.
      const provider = createRuntimeAIProvider(
        runtime,
        {
          diagnostics,
        }
      );

      expect(provider).not.toBeNull();

      console.log(
        "[AutoHeal QA] Live provider:",
        runtime.provider
      );

      // 4. Load the local demo application.
      await page.goto("http://localhost:4173");

      await page
        .locator("#version")
        .selectOption("b");

      // Verify the original locator is unavailable.
      await expect(
        page.locator("#login-button")
      ).toHaveCount(0);

      // 5. Initialize self-healing.
      const healing = new SelfHealingLocator(
        page,
        provider!
      );

      // 6. Evaluate AI recovery safely.
      // No trusted fallback is provided.
      // AI-generated suggestions are not
      // executed automatically.

      await expect(
        healing.resolve(
          "#login-button",
          [],
          {
            enabled: true,
            timeoutMs: 500,
            aiRecovery: {
              enabled: true,
              minimumConfidence: 0.85,
              providerTimeoutMs: 8000,
              validationTimeoutMs: 3000,
              maxCandidates: 5,
            },
          }
        )
      ).rejects.toThrow(
        "Self-healing failed"
      );

      // 7. Read sanitized provider diagnostics.
      const diagnosticEvents =
        diagnostics.getEvents();

      console.log(
        "[AutoHeal QA] Provider diagnostic count:",
        diagnosticEvents.length
      );

      for (const diagnostic of diagnosticEvents) {
        console.log(
          "[AI Provider Diagnostics]",
          JSON.stringify(diagnostic)
        );
      }

      expect(diagnosticEvents).toHaveLength(1);

      const providerDiagnostic =
        diagnosticEvents[0];

      expect(providerDiagnostic.provider).toBe(
        runtime.provider
      );

      expect([
        "success",
        "failure",
      ]).toContain(
        providerDiagnostic.outcome
      );

      // 8. Verify provider metrics.
      const providerName =
        runtime.provider as "gemini" | "openai";

      const metrics =
        diagnostics.getMetrics(providerName);

      expect(metrics.totalRequests).toBe(1);

      console.log(
        "[AutoHeal QA] Provider metrics:",
        JSON.stringify(metrics)
      );

      // 9. Read the recovery event attachment.
      const attachment =
        testInfo.attachments.find(
          item =>
            item.name ===
            "autoheal-ai-recovery-event"
        );

      expect(attachment?.body).toBeDefined();

      const event: {
        event: string;
        provider: string;
        status: string;
        reason?: string;
        evaluatedCandidates?: number;
        diagnostics?: {
          stage?: string;
          durationMs?: number;
          timedOut?: boolean;
        };
      } = JSON.parse(
        attachment!.body!.toString("utf8")
      );

      // 10. Validate the recovery event.
      expect(event.event).toBe(
        "AI_RECOVERY_EVALUATED"
      );

      expect(event.provider).toBe(
        runtime.provider
      );

      expect([
        "SUGGESTED",
        "NO_CANDIDATE",
        "FAILED",
      ]).toContain(event.status);

      // 11. Verify sensitive information
      // is not exposed in the event.
      expect(event).not.toHaveProperty(
        "primarySelector"
      );

      expect(event).not.toHaveProperty(
        "suggestedSelector"
      );

      // 12. Print sanitized recovery metadata.
      console.log(
        "[AutoHeal QA] Recovery status:",
        event.status
      );

      console.log(
        "[AutoHeal QA] Recovery reason:",
        event.reason ?? "NONE"
      );

      console.log(
        "[AutoHeal QA] Recovery stage:",
        event.diagnostics?.stage ?? "UNKNOWN"
      );

      console.log(
        "[AutoHeal QA] Recovery duration:",
        event.diagnostics?.durationMs ?? 0,
        "ms"
      );

      console.log(
        "[AutoHeal QA] Recovery timed out:",
        event.diagnostics?.timedOut ?? false
      );

      console.log(
        "[AutoHeal QA] Evaluated candidates:",
        event.evaluatedCandidates ?? 0
      );

      // 13. Verify no form submission occurred.
      await expect(
        page.getByRole("status")
      ).toBeEmpty();

      console.log(
        "[AutoHeal QA] Live AI safety test completed"
      );
    }
  );
});

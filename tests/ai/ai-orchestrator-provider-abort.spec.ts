
import { test, expect, type Page } from "@playwright/test";

import { AIRecoveryOrchestrator } from "../../src/ai/AIRecoveryOrchestrator";

import type {
  AIProvider,
  AILocatorRequest,
  AILocatorCandidate,
} from "../../src/ai/AIProvider";

/**
 * AutoHeal QA
 *
 * Phase 4.8 - Step 2 - Increment 4
 *
 * Provider-Level Cancellation Propagation
 * and Timeout-Driven Abort
 *
 * PTA-001: Provider timeout aborts active work.
 * PTA-002: Caller cancellation aborts provider work.
 *
 * All provider calls are mocked.
 * No external AI API requests are made.
 */

const TEST_URL = "https://autoheal.test/";

const TEST_HTML = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>AutoHeal QA Cancellation Test</title>
  </head>
  <body>
    <main>
      <h1>AutoHeal QA</h1>

      <form>
        <label for="username">Username</label>

        <input
          id="username"
          name="username"
          type="text"
          placeholder="Enter username"
        />

        <button
          id="submit"
          data-testid="submit"
          type="button"
        >
          Submit
        </button>
      </form>
    </main>
  </body>
</html>
`;

/**
 * Create a valid HTTPS test page.
 *
 * Playwright intercepts navigation locally,
 * so no real network connection is required.
 */
async function setupTestPage(page: Page): Promise<void> {
  await page.route("https://autoheal.test/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: TEST_HTML,
    });
  });

  await page.goto(TEST_URL);

  await expect(page.locator("#submit")).toBeVisible();

  expect(new URL(page.url()).origin).toBe(
    "https://autoheal.test"
  );
}

/**
 * Mock AI provider that remains pending
 * until its AbortSignal is aborted.
 */
class PendingAbortAwareProvider implements AIProvider {
  readonly name = "mock";

  calls = 0;

  receivedSignal?: AbortSignal;

  aborted = false;

  async suggestLocators(
    _request: AILocatorRequest,
    signal?: AbortSignal
  ): Promise<AILocatorCandidate[]> {
    this.calls++;

    this.receivedSignal = signal;

    return new Promise<AILocatorCandidate[]>(
      (_resolve, reject) => {
        if (!signal) {
          reject(new Error("MISSING_PROVIDER_SIGNAL"));
          return;
        }

        const handleAbort = (): void => {
          this.aborted = true;

          reject(new Error("PROVIDER_ABORTED"));
        };

        if (signal.aborted) {
          handleAbort();
          return;
        }

        signal.addEventListener("abort", handleAbort, {
          once: true,
        });
      }
    );
  }
}

/**
 * Print recovery metadata without logging
 * the raw DOM or AI request payload.
 */
function logRecoveryResult(
  testId: string,
  result: Awaited<
    ReturnType<AIRecoveryOrchestrator["suggest"]>
  >,
  provider: PendingAbortAwareProvider
): void {
  console.log(`[${testId}] Recovery:`, {
    status: result.status,
    reason: result.reason,
    stage: result.diagnostics?.stage,
    timedOut: result.diagnostics?.timedOut,
  });

  console.log(`[${testId}] Provider:`, {
    calls: provider.calls,
    signalReceived: provider.receivedSignal !== undefined,
    signalAborted: provider.receivedSignal?.aborted,
    aborted: provider.aborted,
  });
}

test.describe(
  "Phase 4.8 - Provider Timeout Abort Propagation",
  () => {
    /**
     * PTA-001
     *
     * When the provider timeout expires:
     *
     * 1. Provider must have been called.
     * 2. Provider signal must be aborted.
     * 3. Recovery must fail safely.
     * 4. Diagnostics must report a timeout.
     */
    test(
      "PTA-001: provider timeout aborts active work",
      async ({ page }) => {
        await setupTestPage(page);

        const provider = new PendingAbortAwareProvider();

        const orchestrator = new AIRecoveryOrchestrator(
          page,
          provider
        );

        const result = await orchestrator.suggest(
          "#missing-submit",
          {
            enabled: true,
            providerTimeoutMs: 500,
          }
        );

        logRecoveryResult("PTA-001", result, provider);

        expect(
          provider.calls,
          `Provider not invoked; recovery stage: ${
            result.diagnostics?.stage ?? "unknown"
          }, reason: ${result.reason ?? "none"}`
        ).toBe(1);

        expect(provider.receivedSignal).toBeDefined();

        expect(
          provider.receivedSignal?.aborted
        ).toBe(true);

        expect(provider.aborted).toBe(true);

        expect(result.status).toBe("FAILED");

        expect(result.reason).toBe(
          "RECOVERY_PIPELINE_FAILED"
        );

        if (!result.diagnostics) {
          throw new Error(
            "PTA-001: Recovery diagnostics missing"
          );
        }

        expect(result.diagnostics.stage).toBe(
          "PROVIDER"
        );

        expect(result.diagnostics.timedOut).toBe(true);
      }
    );

    /**
     * PTA-002
     *
     * When the caller aborts:
     *
     * 1. Provider must already be running.
     * 2. Caller cancellation must reach provider.
     * 3. Recovery must return RECOVERY_CANCELLED.
     * 4. Cancellation must not be classified
     *    as a provider timeout.
     */
    test(
      "PTA-002: caller cancellation aborts provider work",
      async ({ page }) => {
        await setupTestPage(page);

        const provider = new PendingAbortAwareProvider();

        const orchestrator = new AIRecoveryOrchestrator(
          page,
          provider
        );

        const controller = new AbortController();

        const recoveryPromise = orchestrator.suggest(
          "#missing-submit",
          {
            enabled: true,
            providerTimeoutMs: 5000,
            signal: controller.signal,
          }
        );

        let earlyResult:
          | Awaited<typeof recoveryPromise>
          | undefined;

        void recoveryPromise.then((result) => {
          earlyResult = result;
        });

        // Wait until provider starts or recovery exits.
        await expect
          .poll(
            () =>
              provider.calls > 0 ||
              earlyResult !== undefined,
            {
              timeout: 5000,
              intervals: [20, 50, 100],
            }
          )
          .toBe(true);

        if (provider.calls === 0) {
          const result = await recoveryPromise;

          logRecoveryResult("PTA-002", result, provider);

          throw new Error(
            "PTA-002: Recovery finished before provider " +
            `invocation. Stage: ${
              result.diagnostics?.stage ?? "unknown"
            }, reason: ${result.reason ?? "none"}`
          );
        }

        // Abort after the provider has started.
        controller.abort();

        const result = await recoveryPromise;

        logRecoveryResult("PTA-002", result, provider);

        expect(provider.calls).toBe(1);

        expect(provider.receivedSignal).toBeDefined();

        expect(
          provider.receivedSignal?.aborted
        ).toBe(true);

        expect(provider.aborted).toBe(true);

        expect(result.status).toBe("FAILED");

        expect(result.reason).toBe(
          "RECOVERY_CANCELLED"
        );

        if (!result.diagnostics) {
          throw new Error(
            "PTA-002: Recovery diagnostics missing"
          );
        }

        expect(result.diagnostics.stage).toBe(
          "PROVIDER"
        );

        expect(result.diagnostics.timedOut).toBe(false);
      }
    );
  }
);

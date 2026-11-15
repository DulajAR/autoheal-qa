
import { test, expect } from "@playwright/test";

import { AIRecoveryOrchestrator } from "../../src/ai/AIRecoveryOrchestrator";

import type {
  AIProvider,
  AILocatorCandidate,
} from "../../src/ai/AIProvider";

const candidate: AILocatorCandidate = {
  selector: "#submit",
  confidence: 0.99,
};

const makeProvider = (
  run: () => Promise<AILocatorCandidate[]>
): AIProvider => ({
  name: "mock",
  suggestLocators: run,
});

async function setup(
  page: import("@playwright/test").Page
): Promise<void> {
  await page.route(
    "http://autoheal.test/",
    async (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: '<button id="submit">Submit</button>',
      })
  );

  await page.goto("http://autoheal.test/");
}

test.describe(
  "Phase 4.8 Step 2 Increment 3 - Cancellation Isolation",
  () => {
    test.beforeEach(async ({ page }) => {
      await setup(page);
    });

    test(
      "CI-001: pre-aborted signal never invokes provider",
      async ({ page }) => {
        let calls = 0;

        const controller = new AbortController();
        controller.abort();

        const orchestrator = new AIRecoveryOrchestrator(
          page,
          makeProvider(async () => {
            calls++;
            return [candidate];
          })
        );

        const result = await orchestrator.suggest(
          "#missing",
          {
            enabled: true,
            signal: controller.signal,
          }
        );

        expect(result.status).toBe("FAILED");
        expect(result.reason).toBe("RECOVERY_CANCELLED");
        expect(result.diagnostics?.timedOut).toBe(false);
        expect(result.suggestedSelector).toBeUndefined();
        expect(calls).toBe(0);
      }
    );

    test(
      "CI-002: active pending provider settles on cancellation",
      async ({ page }) => {
        let entered!: () => void;

        const started = new Promise<void>((resolve) => {
          entered = resolve;
        });

        const orchestrator = new AIRecoveryOrchestrator(
          page,
          makeProvider(() => {
            entered();

            return new Promise<AILocatorCandidate[]>(
              () => {}
            );
          })
        );

        const controller = new AbortController();

        const pending = orchestrator.suggest(
          "#missing",
          {
            enabled: true,
            signal: controller.signal,
          }
        );

        await started;
        controller.abort();

        const result = await pending;

        expect(result.status).toBe("FAILED");
        expect(result.reason).toBe("RECOVERY_CANCELLED");
        expect(result.suggestedSelector).toBeUndefined();
      }
    );

    test(
      "CI-003: late success cannot overwrite cancellation",
      async ({ page }) => {
        let release!: (
          candidates: AILocatorCandidate[]
        ) => void;

        let entered!: () => void;

        const started = new Promise<void>((resolve) => {
          entered = resolve;
        });

        const orchestrator = new AIRecoveryOrchestrator(
          page,
          makeProvider(() => {
            entered();

            return new Promise<AILocatorCandidate[]>(
              (resolve) => {
                release = resolve;
              }
            );
          })
        );

        const controller = new AbortController();

        const pending = orchestrator.suggest(
          "#missing",
          {
            enabled: true,
            signal: controller.signal,
          }
        );

        await started;
        controller.abort();

        const result = await pending;

        release([candidate]);
        await Promise.resolve();

        expect(result.reason).toBe("RECOVERY_CANCELLED");
        expect(result.suggestedSelector).toBeUndefined();
      }
    );

    test(
      "CI-004: late rejection cannot overwrite cancellation",
      async ({ page }) => {
        let rejectLate!: (error: Error) => void;
        let entered!: () => void;

        const started = new Promise<void>((resolve) => {
          entered = resolve;
        });

        const orchestrator = new AIRecoveryOrchestrator(
          page,
          makeProvider(() => {
            entered();

            return new Promise<AILocatorCandidate[]>(
              (_, reject) => {
                rejectLate = reject;
              }
            );
          })
        );

        const controller = new AbortController();

        const pending = orchestrator.suggest(
          "#missing",
          {
            enabled: true,
            signal: controller.signal,
          }
        );

        await started;
        controller.abort();

        const result = await pending;

        rejectLate(
          new Error("PRIVATE_PROVIDER_ERROR")
        );

        await Promise.resolve();

        expect(result.reason).toBe("RECOVERY_CANCELLED");

        expect(JSON.stringify(result)).not.toContain(
          "PRIVATE_PROVIDER_ERROR"
        );
      }
    );

    test(
      "CI-005: cancellation does not poison later invocation",
      async ({ page }) => {
        let calls = 0;
        let entered!: () => void;

        const started = new Promise<void>((resolve) => {
          entered = resolve;
        });

        const orchestrator = new AIRecoveryOrchestrator(
          page,
          makeProvider(async () => {
            calls++;

            if (calls === 1) {
              entered();

              return new Promise<AILocatorCandidate[]>(
                () => {}
              );
            }

            return [candidate];
          })
        );

        const controller = new AbortController();

        const pending = orchestrator.suggest(
          "#missing",
          {
            enabled: true,
            signal: controller.signal,
          }
        );

        await started;
        controller.abort();

        const cancelled = await pending;

        const successful = await orchestrator.suggest(
          "#missing",
          {
            enabled: true,
          }
        );

        expect(cancelled.reason).toBe("RECOVERY_CANCELLED");
        expect(successful.status).toBe("SUGGESTED");

        expect(
          cancelled.diagnostics?.recoveryId
        ).not.toBe(
          successful.diagnostics?.recoveryId
        );
      }
    );

    test(
      "CI-006: cancelling one concurrent recovery does not cancel another",
      async ({ page }) => {
        let calls = 0;
        let entered!: () => void;

        const started = new Promise<void>((resolve) => {
          entered = resolve;
        });

        const orchestrator = new AIRecoveryOrchestrator(
          page,
          makeProvider(async () => {
            calls++;

            if (calls === 1) {
              entered();

              return new Promise<AILocatorCandidate[]>(
                () => {}
              );
            }

            return [candidate];
          })
        );

        const controller = new AbortController();

        const first = orchestrator.suggest(
          "#missing-a",
          {
            enabled: true,
            signal: controller.signal,
          }
        );

        await started;

        const second = orchestrator.suggest(
          "#missing-b",
          {
            enabled: true,
          }
        );

        controller.abort();

        const [a, b] = await Promise.all([
          first,
          second,
        ]);

        expect(a.reason).toBe("RECOVERY_CANCELLED");
        expect(b.status).toBe("SUGGESTED");

        expect(a.diagnostics?.recoveryId).not.toBe(
          b.diagnostics?.recoveryId
        );
      }
    );

    test(
      "CI-007: abort after successful completion does not mutate result",
      async ({ page }) => {
        const controller = new AbortController();

        const orchestrator = new AIRecoveryOrchestrator(
          page,
          makeProvider(async () => [candidate])
        );

        const result = await orchestrator.suggest(
          "#missing",
          {
            enabled: true,
            signal: controller.signal,
          }
        );

        expect(result.status).toBe("SUGGESTED");

        controller.abort();

        expect(result.status).toBe("SUGGESTED");

        expect(result.suggestedSelector).toBe(
          candidate.selector
        );
      }
    );
  }
);

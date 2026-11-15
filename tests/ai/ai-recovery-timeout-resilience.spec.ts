import { test, expect } from "@playwright/test";
import { AIRecoveryOrchestrator } from "../../src/ai/AIRecoveryOrchestrator";
import type { AIProvider, AILocatorCandidate } from "../../src/ai/AIProvider";

const candidate: AILocatorCandidate = {
  selector: "#valid-action",
  confidence: 0.99,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function mockProvider(
  fn: AIProvider["suggestLocators"]
): AIProvider {
  return { name: "mock", suggestLocators: fn };
}

const options = { enabled: true, providerTimeoutMs: 30 } as const;

test.describe("Phase 4.8 Step 2 - Timeout Resilience", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("http://autoheal.test/", route =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body></body></html>",
      })
    );
    await page.goto("http://autoheal.test/");
    await page.setContent(
      '<html><body><button id="valid-action">Submit</button></body></html>'
    );
  });

  test("TR-001: pending provider times out with fail-closed diagnostics", async ({ page }) => {
    const pending = deferred<AILocatorCandidate[]>();
    const engine = new AIRecoveryOrchestrator(page, mockProvider(() => pending.promise));
    const result = await engine.suggest("#missing", options);
    expect(result.status).toBe("FAILED");
    expect(result.reason).toBe("RECOVERY_PIPELINE_FAILED");
    expect(result.diagnostics?.stage).toBe("PROVIDER");
    expect(result.diagnostics?.timedOut).toBe(true);
    expect(result.suggestedSelector).toBeUndefined();
    pending.resolve([candidate]);
  });

  test("TR-002: late success cannot mutate a timed-out result", async ({ page }) => {
    const pending = deferred<AILocatorCandidate[]>();
    const engine = new AIRecoveryOrchestrator(page, mockProvider(() => pending.promise));
    const result = await engine.suggest("#missing", options);
    const snapshot = JSON.stringify(result);
    pending.resolve([candidate]);
    await Promise.resolve();
    expect(JSON.stringify(result)).toBe(snapshot);
  });

  test("TR-003: late rejection cannot mutate a timed-out result", async ({ page }) => {
    const pending = deferred<AILocatorCandidate[]>();
    const engine = new AIRecoveryOrchestrator(page, mockProvider(() => pending.promise));
    const result = await engine.suggest("#missing", options);
    const snapshot = JSON.stringify(result);
    pending.reject(new Error("PRIVATE_LATE_FAILURE"));
    await Promise.resolve();
    expect(JSON.stringify(result)).toBe(snapshot);
    expect(snapshot).not.toContain("PRIVATE_LATE_FAILURE");
  });

  test("TR-004: later successful recovery remains isolated from timed-out invocation", async ({ page }) => {
    const first = deferred<AILocatorCandidate[]>();
    let calls = 0;
    const engine = new AIRecoveryOrchestrator(page, mockProvider(() => {
      calls += 1;
      return calls === 1 ? first.promise : Promise.resolve([candidate]);
    }));
    const timedOut = await engine.suggest("#missing-first", options);
    const recovered = await engine.suggest("#missing-second", { enabled: true });
    expect(timedOut.status).toBe("FAILED");
    expect(recovered.status).toBe("SUGGESTED");
    expect(recovered.suggestedSelector).toBe(candidate.selector);
    expect(recovered.diagnostics?.recoveryId).not.toBe(timedOut.diagnostics?.recoveryId);
    first.resolve([candidate]);
  });

  test("TR-005: simultaneous recoveries retain independent timeout outcomes", async ({ page }) => {
    const stalled = deferred<AILocatorCandidate[]>();
    const engine = new AIRecoveryOrchestrator(page, mockProvider(request =>
      request.primarySelector === "#stalled"
        ? stalled.promise
        : Promise.resolve([])
    ));
    const [slow, fast] = await Promise.all([
      engine.suggest("#stalled", options),
      engine.suggest("#fast", options),
    ]);
    expect(slow.status).toBe("FAILED");
    expect(slow.diagnostics?.timedOut).toBe(true);
    expect(fast.status).toBe("NO_CANDIDATE");
    expect(fast.diagnostics?.timedOut).toBe(false);
    expect(slow.diagnostics?.recoveryId).not.toBe(fast.diagnostics?.recoveryId);
    stalled.resolve([]);
  });

  test("TR-006: validation deadline fails closed without a suggestion", async ({ page }) => {
    const engine = new AIRecoveryOrchestrator(
      page, mockProvider(async () => [candidate])
    );
    const result = await engine.suggest("#missing", {
      enabled: true,
      validationTimeoutMs: 1,
    });
    expect(result.status).toBe("FAILED");
    expect(result.reason).toBe("VALIDATION_TIMEOUT");
    expect(result.diagnostics?.stage).toBe("VALIDATION");
    expect(result.diagnostics?.timedOut).toBe(true);
    expect(result.suggestedSelector).toBeUndefined();
  });

  test("TR-007: disabled recovery never invokes a pending provider", async ({ page }) => {
    let called = false;
    const engine = new AIRecoveryOrchestrator(page, mockProvider(() => {
      called = true;
      return new Promise<AILocatorCandidate[]>(() => {});
    }));
    const result = await engine.suggest("#missing", { enabled: false });
    expect(result.status).toBe("DISABLED");
    expect(result.diagnostics?.timedOut).toBe(false);
    expect(called).toBe(false);
  });

  test("TR-008: invalid timeout configuration fails before provider invocation", async ({ page }) => {
    let called = false;
    const engine = new AIRecoveryOrchestrator(page, mockProvider(async () => {
      called = true;
      return [];
    }));
    await expect(engine.suggest("#missing", {
      enabled: true,
      providerTimeoutMs: 0,
    })).rejects.toThrow("providerTimeoutMs");
    expect(called).toBe(false);
  });
});

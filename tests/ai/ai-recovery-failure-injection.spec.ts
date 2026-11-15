import { test, expect } from "@playwright/test";
import { AIRecoveryOrchestrator } from "../../src/ai/AIRecoveryOrchestrator";
import { AIRecoveryAudit } from "../../src/ai/AIRecoveryAudit";
import type { AIRecoveryAuditEvent } from "../../src/ai/AIRecoveryAudit";
import type { AIProvider, AILocatorCandidate } from "../../src/ai/AIProvider";

const VALID = { selector: "#valid-action", confidence: 0.99 };

function provider(
  run: () => Promise<AILocatorCandidate[]>
): AIProvider {
  return { name: "mock", suggestLocators: run };
}

test.describe("Phase 4.8 Step 2 - Failure Injection", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("http://autoheal.test/", async route => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body></body></html>",
      });
    });
    await page.goto("http://autoheal.test/");
    await page.setContent(
      '<html><body><button id="valid-action">Submit</button></body></html>'
    );
  });

  test("FI-001: provider exception fails closed without leaking its message", async ({ page }) => {
    const secret = "PRIVATE_PROVIDER_EXCEPTION_123";
    const engine = new AIRecoveryOrchestrator(
      page, provider(async () => { throw new Error(secret); })
    );
    const result = await engine.suggest("#missing", { enabled: true });
    expect(result.status).toBe("FAILED");
    expect(result.reason).toBe("RECOVERY_PIPELINE_FAILED");
    expect(result.diagnostics?.stage).toBe("PROVIDER");
    expect(result.diagnostics?.timedOut).toBe(false);
    expect(result.suggestedSelector).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  test("FI-002: provider timeout fails closed", async ({ page }) => {
    const engine = new AIRecoveryOrchestrator(
      page, provider(() => new Promise<AILocatorCandidate[]>(() => {}))
    );
    const result = await engine.suggest("#missing", {
      enabled: true, providerTimeoutMs: 25,
    });
    expect(result.status).toBe("FAILED");
    expect(result.reason).toBe("RECOVERY_PIPELINE_FAILED");
    expect(result.diagnostics?.stage).toBe("PROVIDER");
    expect(result.diagnostics?.timedOut).toBe(true);
    expect(result.suggestedSelector).toBeUndefined();
  });

  test("FI-003: non-array provider response is rejected", async ({ page }) => {
    const engine = new AIRecoveryOrchestrator(
      page, provider(async () => ({ unexpected: true }) as unknown as AILocatorCandidate[])
    );
    const result = await engine.suggest("#missing", { enabled: true });
    expect(result.status).toBe("FAILED");
    expect(result.reason).toBe("INVALID_PROVIDER_RESPONSE");
    expect(result.suggestedSelector).toBeUndefined();
    expect(result.diagnostics?.timedOut).toBe(false);
  });

  test("FI-004: empty provider response is not treated as an exception", async ({ page }) => {
    const engine = new AIRecoveryOrchestrator(page, provider(async () => []));
    const result = await engine.suggest("#missing", { enabled: true });
    expect(result.status).toBe("NO_CANDIDATE");
    expect(result.reason).toBe("NO_CANDIDATES_RETURNED");
    expect(result.evaluatedCandidates).toBe(0);
    expect(result.diagnostics?.timedOut).toBe(false);
  });

  test("FI-005: late provider success cannot override timeout", async ({ page }) => {
    let release!: (value: AILocatorCandidate[]) => void;
    const pending = new Promise<AILocatorCandidate[]>(resolve => {
      release = resolve;
    });
    const engine = new AIRecoveryOrchestrator(page, provider(() => pending));
    const result = await engine.suggest("#missing", {
      enabled: true, providerTimeoutMs: 25,
    });
    expect(result.status).toBe("FAILED");
    expect(result.diagnostics?.timedOut).toBe(true);
    release([VALID]);
    await Promise.resolve();
    expect(result.status).toBe("FAILED");
    expect(result.suggestedSelector).toBeUndefined();
  });

  test("FI-006: failure does not poison subsequent invocation", async ({ page }) => {
    let calls = 0;
    const engine = new AIRecoveryOrchestrator(
      page,
      provider(async () => {
        calls++;
        if (calls === 1) throw new Error("injected");
        return [VALID];
      })
    );
    const first = await engine.suggest("#missing", { enabled: true });
    const second = await engine.suggest("#missing", { enabled: true });
    expect(first.status).toBe("FAILED");
    expect(second.status).toBe("SUGGESTED");
    expect(second.suggestedSelector).toBe(VALID.selector);
    expect(first.diagnostics?.recoveryId).not.toBe(second.diagnostics?.recoveryId);
  });

  test("FI-007: concurrent calls retain distinct recovery IDs", async ({ page }) => {
    const engine = new AIRecoveryOrchestrator(page, provider(async () => []));
    const [a, b] = await Promise.all([
      engine.suggest("#missing-a", { enabled: true }),
      engine.suggest("#missing-b", { enabled: true }),
    ]);
    expect(a.status).toBe("NO_CANDIDATE");
    expect(b.status).toBe("NO_CANDIDATE");
    expect(a.diagnostics?.recoveryId).toBeTruthy();
    expect(a.diagnostics?.recoveryId).not.toBe(b.diagnostics?.recoveryId);
  });

  test("FI-008: failed recovery audit preserves safe correlation metadata", async ({ page }, testInfo) => {
    const secret = "PRIVATE_FAILURE_MESSAGE_456";
    const engine = new AIRecoveryOrchestrator(
      page, provider(async () => { throw new Error(secret); })
    );
    const result = await engine.suggest("#private-selector", { enabled: true });
    AIRecoveryAudit.record(result);
    const attachment = testInfo.attachments
      .filter(item => item.name === "autoheal-ai-recovery-event")
      .at(-1);
    expect(attachment?.body).toBeDefined();
    const event = JSON.parse(attachment!.body!.toString("utf8")) as AIRecoveryAuditEvent;
    expect(event.status).toBe("FAILED");
    expect(event.recoveryId).toBe(result.diagnostics?.recoveryId);
    expect(event.diagnostics?.recoveryId).toBe(result.diagnostics?.recoveryId);
    expect(JSON.stringify(event)).not.toContain(secret);
    expect(JSON.stringify(event)).not.toContain("#private-selector");
  });
});

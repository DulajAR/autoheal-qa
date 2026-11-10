
import { test, expect } from "@playwright/test";

import { AIRecoveryOrchestrator } from "../../src/ai/AIRecoveryOrchestrator";
import { MockAIProvider } from "../../src/ai/MockAIProvider";
import { AIRecoveryAudit } from "../../src/ai/AIRecoveryAudit";

const AUDIT_NAME = "autoheal-ai-recovery-event";

test.describe("Phase 4.3 - AI Recovery Analytics Integration", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("http://autoheal.test/", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body></body></html>",
      });
    });

    await page.goto("http://autoheal.test/");

    await page.setContent(`
      <button id="valid-action">Submit</button>
      <button id="hidden-action" hidden>Hidden</button>
    `);
  });

  test(
    "ANA-001: accepted and rejected candidates reach Playwright audit",
    async ({ page }, testInfo) => {
      const orchestrator = new AIRecoveryOrchestrator(
        page,
        new MockAIProvider([
          { selector: "#valid-action", confidence: 0.99 },
          { selector: "#hidden-action", confidence: 0.95 },
        ])
      );

      const result = await orchestrator.suggest("#missing-action", {
        enabled: true,
      });

      expect(result.status).toBe("SUGGESTED");
      expect(result.explanation?.acceptedCandidates).toBe(1);
      expect(result.explanation?.rejectedCandidates).toBe(1);

      const before = testInfo.attachments.filter(
        (attachment) => attachment.name === AUDIT_NAME
      ).length;

      AIRecoveryAudit.record(result);

      const attachments = testInfo.attachments.filter(
        (attachment) => attachment.name === AUDIT_NAME
      );

      expect(attachments).toHaveLength(before + 1);

      const last = attachments[attachments.length - 1];

      expect(last.body).toBeDefined();

      const event = JSON.parse(last.body!.toString("utf8"));

      expect(event.event).toBe("AI_RECOVERY_EVALUATED");
      expect(event.status).toBe("SUGGESTED");

      expect(event.analytics).toEqual(
        expect.objectContaining({
          acceptedCandidates: 1,
          rejectedCandidates: 1,
        })
      );

      expect(event.analytics.validationDurationMs).toEqual(
        expect.any(Number)
      );

      expect(
        event.analytics.validationDurationMs
      ).toBeGreaterThanOrEqual(0);

      const serialized = JSON.stringify(event);

      expect(serialized).not.toContain("#valid-action");
      expect(serialized).not.toContain("#hidden-action");
      expect(serialized).not.toContain("#missing-action");
    }
  );

  test(
    "ANA-002: rejected candidate reason is reported",
    async ({ page }, testInfo) => {
      const orchestrator = new AIRecoveryOrchestrator(
        page,
        new MockAIProvider([
          { selector: "#valid-action", confidence: 0.4 },
        ])
      );

      const result = await orchestrator.suggest("#missing-action", {
        enabled: true,
      });

      expect(result.status).toBe("NO_CANDIDATE");

      AIRecoveryAudit.record(result);

      const attachment = testInfo.attachments
        .filter((attachment) => attachment.name === AUDIT_NAME)
        .at(-1);

      expect(attachment?.body).toBeDefined();

      const event = JSON.parse(
        attachment!.body!.toString("utf8")
      );

      expect(event.analytics.rejectedCandidates).toBe(1);

      expect(
        event.analytics.rejectionReasons.LOW_CONFIDENCE
      ).toBeGreaterThanOrEqual(1);
    }
  );
});

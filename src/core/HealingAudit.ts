
import { test } from "@playwright/test";
import { Logger } from "./Logger";

export type HealingAuditEvent = {
  event: "LOCATOR_HEALED";
  timestamp: string;
  primarySelector: string;
  recoveredSelector: string;
  strategy: string;
  confidence: number;
};

export class HealingAudit {
  static record(
    event: Omit<
      HealingAuditEvent,
      "event" | "timestamp"
    >
  ): void {
    const auditEvent: HealingAuditEvent = {
      event: "LOCATOR_HEALED",
      timestamp: new Date().toISOString(),
      ...event,
    };

    Logger.warn("LOCATOR_HEALED", {
      primarySelector: auditEvent.primarySelector,
      recoveredSelector: auditEvent.recoveredSelector,
      strategy: auditEvent.strategy,
      confidence: auditEvent.confidence,
    });

    try {
      const testInfo = test.info();

      testInfo.attachments.push({
        name: "autoheal-healing-event",
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify(auditEvent),
          "utf8"
        ),
      });
    } catch {
      // Allow logging outside Playwright test context.
    }
  }
}

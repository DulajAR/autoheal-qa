
import { test } from "@playwright/test";
import { Logger } from "../core/Logger";
import type { AIRecoveryResult } from "./AIRecoveryTypes";

export type AIRecoveryAuditEvent = {
  event: "AI_RECOVERY_EVALUATED";
  timestamp: string;
  status: AIRecoveryResult["status"];
  provider: string;
  evaluatedCandidates: number;
  reason?: string;
  confidence?: number;
};

export class AIRecoveryAudit {
  static record(result: AIRecoveryResult): void {
    const auditEvent: AIRecoveryAuditEvent = {
      event: "AI_RECOVERY_EVALUATED",
      timestamp: new Date().toISOString(),
      status: result.status,
      provider: result.provider,
      evaluatedCandidates: result.evaluatedCandidates,
      ...(result.reason !== undefined
        ? { reason: result.reason }
        : {}),
      ...(result.confidence !== undefined
        ? { confidence: result.confidence }
        : {}),
    };

    // Never expose raw DOM or suggested selectors.
    Logger.info("AI_RECOVERY_EVALUATED", {
      status: auditEvent.status,
      provider: auditEvent.provider,
      evaluatedCandidates:
        auditEvent.evaluatedCandidates,
      ...(auditEvent.reason !== undefined
        ? { reason: auditEvent.reason }
        : {}),
      ...(auditEvent.confidence !== undefined
        ? { confidence: auditEvent.confidence }
        : {}),
    });

    try {
      const testInfo = test.info();

      testInfo.attachments.push({
        name: "autoheal-ai-recovery-event",
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify(auditEvent),
          "utf8"
        ),
      });
    } catch {
      // Allow logging outside Playwright tests.
    }
  }
}

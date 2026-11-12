
import { test } from "@playwright/test";
import { Logger } from "../core/Logger";

import type {
  AIRecoveryResult,
} from "./AIRecoveryTypes";

import type {
  AICandidateDecisionReason,
} from "./AIRecoveryExplainabilityTypes";

import type {
  AIRecoveryDiagnostics,
} from "./AIRecoveryDiagnostics";

/**
 * Privacy-safe candidate decision analytics.
 */
export type AIRecoveryDecisionAnalytics = {
  acceptedCandidates: number;
  rejectedCandidates: number;
  notEvaluatedCandidates: number;
  validationDurationMs: number;

  rejectionReasons: Partial<
    Record<AICandidateDecisionReason, number>
  >;
};

/**
 * Backward-compatible AI recovery audit event.
 */
export type AIRecoveryAuditEvent = {
  event: "AI_RECOVERY_EVALUATED";
  timestamp: string;
  status: AIRecoveryResult["status"];
  provider: string;
  evaluatedCandidates: number;
  reason?: string;
  confidence?: number;
  analytics?: AIRecoveryDecisionAnalytics;

  /**
   * Phase 4.7 correlation metadata.
   */
  recoveryId?: string;
  diagnostics?: AIRecoveryDiagnostics;
};

/**
 * Convert candidate decisions to aggregate analytics.
 *
 * A rejection reason is counted once per
 * rejected candidate.
 */
function buildDecisionAnalytics(
  result: AIRecoveryResult
): AIRecoveryDecisionAnalytics | undefined {
  const explanation = result.explanation;

  if (!explanation) {
    return undefined;
  }

  const decisions = explanation.decisions;

  const notEvaluatedCandidates = decisions.filter(
    (decision) =>
      decision.decision === "NOT_EVALUATED"
  ).length;

  const rejectionReasons: Partial<
    Record<AICandidateDecisionReason, number>
  > = Object.create(null);

  for (const decision of decisions) {
    if (decision.decision !== "REJECTED") {
      continue;
    }

    const uniqueReasons = new Set(
      decision.reasons
    );

    for (const reason of uniqueReasons) {
      rejectionReasons[reason] =
        (rejectionReasons[reason] ?? 0) + 1;
    }
  }

  return {
    acceptedCandidates:
      explanation.acceptedCandidates,

    rejectedCandidates:
      explanation.rejectedCandidates,

    notEvaluatedCandidates,

    validationDurationMs:
      explanation.validationDurationMs,

    rejectionReasons,
  };
}

/**
 * Record a privacy-safe advisory AI recovery event.
 */
export class AIRecoveryAudit {
  static record(result: AIRecoveryResult): void {
    const analytics = buildDecisionAnalytics(
      result
    );

    const diagnostics = result.diagnostics;

    const auditEvent: AIRecoveryAuditEvent = {
      event: "AI_RECOVERY_EVALUATED",

      timestamp: new Date().toISOString(),

      status: result.status,

      provider: result.provider,

      evaluatedCandidates:
        result.evaluatedCandidates,

      ...(result.reason !== undefined
        ? { reason: result.reason }
        : {}),

      ...(result.confidence !== undefined
        ? { confidence: result.confidence }
        : {}),

      ...(analytics !== undefined
        ? { analytics }
        : {}),

      ...(diagnostics !== undefined
        ? {
            recoveryId: diagnostics.recoveryId,
            diagnostics: { ...diagnostics },
          }
        : {}),
    };

    /**
     * Logger accepts primitive context values only.
     * Never log selectors, DOM content, or raw errors.
     */
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

      ...(analytics !== undefined
        ? {
            acceptedCandidates:
              analytics.acceptedCandidates,

            rejectedCandidates:
              analytics.rejectedCandidates,

            notEvaluatedCandidates:
              analytics.notEvaluatedCandidates,

            validationDurationMs:
              analytics.validationDurationMs,
          }
        : {}),

      ...(diagnostics !== undefined
        ? {
            recoveryId: diagnostics.recoveryId,
            recoveryStage: diagnostics.stage,
            recoveryDurationMs:
              diagnostics.durationMs,
            recoveryTimedOut:
              diagnostics.timedOut,
          }
        : {}),
    });

    /**
     * Keep the established reporter attachment
     * name and JSON content type.
     */
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
      // Recovery audits can also run outside
      // an active Playwright test.
    }
  }
}

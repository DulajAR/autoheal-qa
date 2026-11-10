
import { test } from "@playwright/test";
import { Logger } from "../core/Logger";

import type {
  AIRecoveryResult,
} from "./AIRecoveryTypes";

import type {
  AICandidateDecisionReason,
} from "./AIRecoveryExplainabilityTypes";

/**
 * Phase 4.3 — Privacy-safe AI recovery analytics.
 *
 * Stores aggregate decision metrics only.
 *
 * Never includes:
 * - Raw DOM content
 * - Original selectors
 * - Suggested selectors
 * - Recovered selectors
 * - Page source
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
 * AI recovery audit event.
 *
 * Maintains backward compatibility with
 * existing Phase 3.7 audit events.
 *
 * Phase 4.3 analytics are optional.
 */
export type AIRecoveryAuditEvent = {
  event: "AI_RECOVERY_EVALUATED";

  timestamp: string;

  status: AIRecoveryResult["status"];

  provider: string;

  evaluatedCandidates: number;

  reason?: string;

  confidence?: number;

  /**
   * Phase 4.3 candidate decision analytics.
   */
  analytics?: AIRecoveryDecisionAnalytics;
};

/**
 * Convert Phase 4.2 recovery explanations into
 * privacy-safe Phase 4.3 analytics.
 *
 * Each rejection reason is counted only once
 * per rejected candidate.
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
    decision =>
      decision.decision === "NOT_EVALUATED"
  ).length;

  const rejectionReasons: Partial<
    Record<AICandidateDecisionReason, number>
  > = Object.create(null);

  for (const decision of decisions) {
    if (decision.decision !== "REJECTED") {
      continue;
    }

    /**
     * Avoid counting duplicate reasons
     * for the same candidate.
     */
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
 * Records advisory AI recovery evaluations.
 *
 * AI suggestions are not automatically executed.
 *
 * Logging remains compatible with the existing
 * Logger LogContext primitive value types.
 */
export class AIRecoveryAudit {
  static record(result: AIRecoveryResult): void {
    /**
     * Build structured analytics once.
     */
    const analytics = buildDecisionAnalytics(
      result
    );

    /**
     * Create the AI recovery audit event.
     */
    const auditEvent: AIRecoveryAuditEvent = {
      event: "AI_RECOVERY_EVALUATED",

      timestamp: new Date().toISOString(),

      status: result.status,

      provider: result.provider,

      evaluatedCandidates:
        result.evaluatedCandidates,

      ...(result.reason !== undefined
        ? {
            reason: result.reason,
          }
        : {}),

      ...(result.confidence !== undefined
        ? {
            confidence: result.confidence,
          }
        : {}),

      ...(analytics !== undefined
        ? {
            analytics,
          }
        : {}),
    };

    /**
     * Log only primitive values.
     *
     * Logger.info() accepts:
     * string | number | boolean | null
     *
     * Do not pass the nested analytics object
     * directly into Logger.info().
     */
    Logger.info("AI_RECOVERY_EVALUATED", {
      status: auditEvent.status,

      provider: auditEvent.provider,

      evaluatedCandidates:
        auditEvent.evaluatedCandidates,

      ...(auditEvent.reason !== undefined
        ? {
            reason: auditEvent.reason,
          }
        : {}),

      ...(auditEvent.confidence !== undefined
        ? {
            confidence: auditEvent.confidence,
          }
        : {}),

      /**
       * Flatten analytics into primitive values
       * to preserve Logger compatibility.
       */
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
    });

    /**
     * Attach the structured audit event
     * to the active Playwright test.
     *
     * The reporter will process this attachment
     * in the next implementation step.
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
      /**
       * Allow audit logging outside
       * an active Playwright test.
       */
    }
  }
}


import type {
  AIRecoveryAuditEvent,
} from "./AIRecoveryAudit";

import type {
  AIRecoveryStage,
} from "./AIRecoveryDiagnostics";

export type RecoveryIntegrityIssueCode =
  | "INVALID_EVENT"
  | "PARTIAL_CORRELATION"
  | "INVALID_RECOVERY_ID"
  | "MISMATCHED_RECOVERY_ID"
  | "DUPLICATE_RECOVERY_ID"
  | "INVALID_DIAGNOSTICS"
  | "INVALID_STATUS"
  | "INCONSISTENT_TIMEOUT";

export type RecoveryIntegrityIssue = {
  eventIndex: number;
  code: RecoveryIntegrityIssueCode;
};

export type RecoveryIntegrityReport = {
  valid: boolean;
  totalEvents: number;
  correlatedEvents: number;
  legacyEvents: number;
  invalidEvents: number;
  issues: RecoveryIntegrityIssue[];
};

const VALID_STAGES = new Set<AIRecoveryStage>([
  "CONFIGURATION",
  "AUTHORIZATION",
  "DOM_EXTRACTION",
  "PROVIDER",
  "VALIDATION",
  "RANKING",
  "COMPLETED",
]);

const VALID_STATUSES = new Set([
  "SUGGESTED",
  "NO_CANDIDATE",
  "DISABLED",
  "FAILED",
]);

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

/**
 * Validates recovery audit integrity within one
 * Playwright test attempt.
 *
 * Historical events without correlation metadata
 * remain valid.
 *
 * No selectors, DOM content, provider responses,
 * or arbitrary source fields are returned.
 */
export function validateRecoveryLifecycle(
  events: readonly unknown[]
): RecoveryIntegrityReport {
  const issues: RecoveryIntegrityIssue[] = [];
  const seenIds = new Set<string>();

  let correlatedEvents = 0;
  let legacyEvents = 0;
  let invalidEvents = 0;

  events.forEach((value, eventIndex) => {
    const eventIssues: RecoveryIntegrityIssueCode[] = [];

    const addIssue = (
      code: RecoveryIntegrityIssueCode
    ): void => {
      if (!eventIssues.includes(code)) {
        eventIssues.push(code);
      }
    };

    if (!isRecord(value)) {
      addIssue("INVALID_EVENT");
    } else {
      const event = value;

      if (
        event.event !== "AI_RECOVERY_EVALUATED" ||
        typeof event.timestamp !== "string" ||
        !Number.isFinite(Date.parse(event.timestamp)) ||
        typeof event.provider !== "string" ||
        event.provider.length === 0 ||
        typeof event.evaluatedCandidates !== "number" ||
        !Number.isSafeInteger(event.evaluatedCandidates) ||
        event.evaluatedCandidates < 0
      ) {
        addIssue("INVALID_EVENT");
      }

      if (!VALID_STATUSES.has(String(event.status))) {
        addIssue("INVALID_STATUS");
      }

      const hasId = event.recoveryId !== undefined;
      const hasDiagnostics =
        event.diagnostics !== undefined;

      if (!hasId && !hasDiagnostics) {
        legacyEvents++;
      } else {
        correlatedEvents++;

        if (hasId !== hasDiagnostics) {
          addIssue("PARTIAL_CORRELATION");
        }

        if (
          typeof event.recoveryId !== "string" ||
          !UUID_V4.test(event.recoveryId)
        ) {
          addIssue("INVALID_RECOVERY_ID");
        } else {
          const normalizedId =
            event.recoveryId.toLowerCase();

          if (seenIds.has(normalizedId)) {
            addIssue("DUPLICATE_RECOVERY_ID");
          } else {
            seenIds.add(normalizedId);
          }
        }

        if (!isRecord(event.diagnostics)) {
          addIssue("INVALID_DIAGNOSTICS");
        } else {
          const diagnostics = event.diagnostics;

          if (
            typeof diagnostics.recoveryId !==
              "string" ||
            diagnostics.recoveryId !==
              event.recoveryId
          ) {
            addIssue("MISMATCHED_RECOVERY_ID");
          }

          if (
            !VALID_STAGES.has(
              diagnostics.stage as AIRecoveryStage
            ) ||
            typeof diagnostics.durationMs !==
              "number" ||
            !Number.isFinite(diagnostics.durationMs) ||
            diagnostics.durationMs < 0 ||
            typeof diagnostics.timedOut !== "boolean"
          ) {
            addIssue("INVALID_DIAGNOSTICS");
          }

          if (
            diagnostics.timedOut === true &&
            event.status !== "FAILED"
          ) {
            addIssue("INCONSISTENT_TIMEOUT");
          }
        }
      }
    }

    if (eventIssues.length > 0) {
      invalidEvents++;

      for (const code of eventIssues) {
        issues.push({
          eventIndex,
          code,
        });
      }
    }
  });

  return {
    valid: issues.length === 0,
    totalEvents: events.length,
    correlatedEvents,
    legacyEvents,
    invalidEvents,
    issues,
  };
}

/**
 * Typed convenience wrapper for validated
 * AI recovery audit events.
 */
export function validateRecoveryAuditEvents(
  events: readonly AIRecoveryAuditEvent[]
): RecoveryIntegrityReport {
  return validateRecoveryLifecycle(events);
}

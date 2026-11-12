
import type {
  Reporter,
  FullResult,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

import fs from "node:fs";
import path from "node:path";

import type {
  AIRecoveryAuditEvent,
  AIRecoveryDecisionAnalytics,
} from "../ai/AIRecoveryAudit";

import type {
  AICandidateDecisionReason,
} from "../ai/AIRecoveryExplainabilityTypes";

export type HealingAuditEvent = {
  event: "LOCATOR_HEALED";
  timestamp: string;
  primarySelector: string;
  recoveredSelector: string;
  strategy: string;
  confidence: number;
};

export type TestRecord = {
  title: string;
  project: string;
  status: string;
  durationMs: number;
  retry: number;
  error?: string;
  healingEvents: HealingAuditEvent[];
  aiRecoveryEvents: AIRecoveryAuditEvent[];
};

export type HealingSummary = {
  totalEvents: number;
  healedAttempts: number;
  averageConfidence: number | null;
  events: HealingAuditEvent[];
};

export type AIRecoveryDecisionSummary = {
  eventsWithAnalytics: number;
  acceptedCandidates: number;
  rejectedCandidates: number;
  notEvaluatedCandidates: number;
  totalValidationDurationMs: number;
  averageValidationDurationMs: number | null;
  rejectionReasons: Partial<
    Record<AICandidateDecisionReason, number>
  >;
};

export type AIRecoverySummary = {
  totalEvaluations: number;
  suggested: number;
  noCandidate: number;
  disabled: number;
  failed: number;
  evaluatedCandidates: number;
  averageConfidence: number | null;
  events: AIRecoveryAuditEvent[];

  // Phase 4.3
  decisionAnalytics: AIRecoveryDecisionSummary;
};

/**
 * Only known, non-sensitive reason codes
 * may be included in analytics.
 */
const ALLOWED_REJECTION_REASONS = [
  "INVALID_SELECTOR",
  "INVALID_CONFIDENCE",
  "LOW_CONFIDENCE",
  "NO_MATCH",
  "AMBIGUOUS_MATCH",
  "NOT_VISIBLE",
  "UNSAFE_TARGET",
  "NOT_UNIQUE",
  "DUPLICATE_SELECTOR",
  "MALFORMED_CANDIDATE",
  "VALIDATION_TIMEOUT",
  "NOT_SELECTED",
] as const satisfies readonly AICandidateDecisionReason[];

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isNonNegativeInteger(
  value: unknown
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function isNonNegativeFiniteNumber(
  value: unknown
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
  );
}

/** Phase 4.7: strictly validate correlation metadata from attachments. */
const RECOVERY_STAGES = [
  "CONFIGURATION", "AUTHORIZATION", "DOM_EXTRACTION",
  "PROVIDER", "VALIDATION", "RANKING", "COMPLETED",
] as const;

const RECOVERY_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecoveryDiagnostics(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.recoveryId === "string" &&
    RECOVERY_ID_PATTERN.test(value.recoveryId) &&
    typeof value.stage === "string" &&
    RECOVERY_STAGES.some(stage => stage === value.stage) &&
    isNonNegativeFiniteNumber(value.durationMs) &&
    typeof value.timedOut === "boolean"
  );
}

/**
 * Validate the Phase 4.3 analytics payload.
 *
 * The reporter does not trust attachment data
 * merely because it came from a test.
 */
function isDecisionAnalytics(
  value: unknown
): value is AIRecoveryDecisionAnalytics {
  if (!isRecord(value)) {
    return false;
  }

  if (
    !isNonNegativeInteger(value.acceptedCandidates) ||
    !isNonNegativeInteger(value.rejectedCandidates) ||
    !isNonNegativeInteger(value.notEvaluatedCandidates) ||
    !isNonNegativeFiniteNumber(
      value.validationDurationMs
    ) ||
    !isRecord(value.rejectionReasons)
  ) {
    return false;
  }

  const reasons = value.rejectionReasons;

  let totalReasonOccurrences = 0;

  for (const [reason, count] of Object.entries(reasons)) {
    if (
      !ALLOWED_REJECTION_REASONS.includes(
        reason as AICandidateDecisionReason
      ) ||
      !isNonNegativeInteger(count) ||
      count > value.rejectedCandidates
    ) {
      return false;
    }

    totalReasonOccurrences += count;

    if (!Number.isSafeInteger(totalReasonOccurrences)) {
      return false;
    }
  }

  return true;
}

/**
 * Explicitly copy approved analytics properties.
 * Never spread untrusted attachment objects.
 */
function sanitizeDecisionAnalytics(
  value: AIRecoveryDecisionAnalytics
): AIRecoveryDecisionAnalytics {
  const rejectionReasons: Partial<
    Record<AICandidateDecisionReason, number>
  > = Object.create(null);

  for (const reason of ALLOWED_REJECTION_REASONS) {
    const count = value.rejectionReasons[reason];

    if (count !== undefined) {
      rejectionReasons[reason] = count;
    }
  }

  return {
    acceptedCandidates: value.acceptedCandidates,
    rejectedCandidates: value.rejectedCandidates,
    notEvaluatedCandidates: value.notEvaluatedCandidates,
    validationDurationMs: value.validationDurationMs,
    rejectionReasons,
  };
}

class AutoHealReporter implements Reporter {
  private readonly records: TestRecord[] = [];

  private startedAt = new Date();

  onBegin(): void {
    this.records.length = 0;
    this.startedAt = new Date();

    console.log("[AutoHeal QA] Reporter initialized");
  }

  /**
   * Preserve deterministic healing validation.
   */
  private isHealingAuditEvent(
    value: unknown
  ): value is HealingAuditEvent {
    if (!isRecord(value)) {
      return false;
    }

    return (
      value.event === "LOCATOR_HEALED" &&
      typeof value.timestamp === "string" &&
      Number.isFinite(Date.parse(value.timestamp)) &&
      typeof value.primarySelector === "string" &&
      value.primarySelector.length > 0 &&
      typeof value.recoveredSelector === "string" &&
      value.recoveredSelector.length > 0 &&
      typeof value.strategy === "string" &&
      value.strategy.length > 0 &&
      typeof value.confidence === "number" &&
      Number.isFinite(value.confidence) &&
      value.confidence >= 0.85 &&
      value.confidence <= 1
    );
  }

  /** Validate legacy and Phase 4.7 AI audit events. */
  private isAIRecoveryAuditEvent(
    value: unknown
  ): value is AIRecoveryAuditEvent {
    if (!isRecord(value)) return false;

    const validStatuses = [
      "SUGGESTED", "NO_CANDIDATE", "DISABLED", "FAILED",
    ];

    const baseValid =
      value.event === "AI_RECOVERY_EVALUATED" &&
      typeof value.timestamp === "string" &&
      Number.isFinite(Date.parse(value.timestamp)) &&
      validStatuses.includes(String(value.status)) &&
      typeof value.provider === "string" &&
      value.provider.length > 0 &&
      isNonNegativeInteger(value.evaluatedCandidates) &&
      (value.reason === undefined || typeof value.reason === "string") &&
      (value.confidence === undefined || (
        typeof value.confidence === "number" &&
        Number.isFinite(value.confidence) &&
        value.confidence >= 0 && value.confidence <= 1
      ));

    if (!baseValid) return false;

    const hasRecoveryId = value.recoveryId !== undefined;
    const hasDiagnostics = value.diagnostics !== undefined;
    if (hasRecoveryId !== hasDiagnostics) return false;

    if (hasDiagnostics) {
      if (
        typeof value.recoveryId !== "string" ||
        !isRecoveryDiagnostics(value.diagnostics)
      ) return false;

      const diagnostics = value.diagnostics;
      if (!isRecord(diagnostics)) return false;
      if (diagnostics.recoveryId !== value.recoveryId) return false;
      if (diagnostics.timedOut === true && value.status !== "FAILED") {
        return false;
      }
    }

    if (value.analytics === undefined) return true;
    if (!isDecisionAnalytics(value.analytics)) return false;

    const analytics = value.analytics;
    // Not-evaluated candidates must NOT count as evaluated.
    const evaluatedDecisions =
      analytics.acceptedCandidates + analytics.rejectedCandidates;
    const trackedDecisions =
      evaluatedDecisions + analytics.notEvaluatedCandidates;

    return (
      Number.isSafeInteger(evaluatedDecisions) &&
      evaluatedDecisions === value.evaluatedCandidates &&
      Number.isSafeInteger(trackedDecisions)
    );
  }

  /**
   * Read an attachment from memory or disk.
   */
  private readAttachment(
    attachment: TestResult["attachments"][number]
  ): unknown | null {
    try {
      let raw: string;

      if (attachment.body) {
        raw = attachment.body.toString("utf8");
      } else if (attachment.path) {
        raw = fs.readFileSync(attachment.path, "utf8");
      } else {
        return null;
      }

      return JSON.parse(raw) as unknown;
    } catch {
      console.warn(
        "[AutoHeal QA] Failed to parse audit attachment"
      );

      return null;
    }
  }

  private extractHealingEvents(
    result: TestResult
  ): HealingAuditEvent[] {
    const events: HealingAuditEvent[] = [];

    for (const attachment of result.attachments) {
      if (attachment.name !== "autoheal-healing-event") {
        continue;
      }

      const parsed = this.readAttachment(attachment);

      if (this.isHealingAuditEvent(parsed)) {
        events.push(parsed);
      } else {
        console.warn(
          "[AutoHeal QA] Invalid healing audit event structure"
        );
      }
    }

    return events;
  }

  /**
   * Extract validated, sanitized AI recovery events.
   */
  private extractAIRecoveryEvents(
    result: TestResult
  ): AIRecoveryAuditEvent[] {
    const events: AIRecoveryAuditEvent[] = [];

    for (const attachment of result.attachments) {
      if (
        attachment.name !== "autoheal-ai-recovery-event"
      ) {
        continue;
      }

      const parsed = this.readAttachment(attachment);

      if (!this.isAIRecoveryAuditEvent(parsed)) {
        console.warn(
          "[AutoHeal QA] Invalid AI recovery audit event structure"
        );

        continue;
      }

      const sanitized: AIRecoveryAuditEvent = {
        event: parsed.event,
        timestamp: parsed.timestamp,
        status: parsed.status,
        provider: parsed.provider,
        evaluatedCandidates: parsed.evaluatedCandidates,

        ...(parsed.reason !== undefined
          ? { reason: parsed.reason }
          : {}),

        ...(parsed.confidence !== undefined
          ? { confidence: parsed.confidence }
          : {}),

        ...(parsed.analytics !== undefined
          ? {
              analytics: sanitizeDecisionAnalytics(
                parsed.analytics
              ),
            }
          : {}),

        ...(parsed.diagnostics !== undefined &&
        parsed.recoveryId !== undefined
          ? {
              recoveryId: parsed.recoveryId,
              diagnostics: {
                recoveryId: parsed.diagnostics.recoveryId,
                stage: parsed.diagnostics.stage,
                durationMs: parsed.diagnostics.durationMs,
                timedOut: parsed.diagnostics.timedOut,
              },
            }
          : {}),
      };

      events.push(sanitized);
    }

    return events;
  }

  onTestEnd(
    test: TestCase,
    result: TestResult
  ): void {
    this.records.push({
      title: test.titlePath().join(" > "),
      project: test.parent.project()?.name ?? "unknown",
      status: result.status,
      durationMs: result.duration,
      retry: result.retry,
      error: result.error?.message,
      healingEvents: this.extractHealingEvents(result),
      aiRecoveryEvents: this.extractAIRecoveryEvents(result),
    });
  }

  private buildHealingSummary(): HealingSummary {
    const events = this.records.flatMap(
      record => record.healingEvents
    );

    const healedAttempts = this.records.filter(
      record => record.healingEvents.length > 0
    ).length;

    const totalEvents = events.length;

    const averageConfidence =
      totalEvents > 0
        ? Number(
            (
              events.reduce(
                (sum, event) => sum + event.confidence,
                0
              ) / totalEvents
            ).toFixed(3)
          )
        : null;

    return {
      totalEvents,
      healedAttempts,
      averageConfidence,
      events,
    };
  }

  /**
   * Phase 4.3: aggregate candidate decision analytics.
   */
  private buildDecisionSummary(
    events: AIRecoveryAuditEvent[]
  ): AIRecoveryDecisionSummary {
    const analyticsEvents = events
      .map(event => event.analytics)
      .filter(
        (analytics): analytics is AIRecoveryDecisionAnalytics =>
          analytics !== undefined
      );

    const rejectionReasons: Partial<
      Record<AICandidateDecisionReason, number>
    > = Object.create(null);

    let acceptedCandidates = 0;
    let rejectedCandidates = 0;
    let notEvaluatedCandidates = 0;
    let totalValidationDurationMs = 0;

    for (const analytics of analyticsEvents) {
      acceptedCandidates += analytics.acceptedCandidates;
      rejectedCandidates += analytics.rejectedCandidates;
      notEvaluatedCandidates +=
        analytics.notEvaluatedCandidates;

      totalValidationDurationMs +=
        analytics.validationDurationMs;

      for (const reason of ALLOWED_REJECTION_REASONS) {
        const count = analytics.rejectionReasons[reason];

        if (count !== undefined) {
          rejectionReasons[reason] =
            (rejectionReasons[reason] ?? 0) + count;
        }
      }
    }

    const averageValidationDurationMs =
      analyticsEvents.length > 0
        ? Number(
            (
              totalValidationDurationMs /
              analyticsEvents.length
            ).toFixed(3)
          )
        : null;

    return {
      eventsWithAnalytics: analyticsEvents.length,
      acceptedCandidates,
      rejectedCandidates,
      notEvaluatedCandidates,
      totalValidationDurationMs,
      averageValidationDurationMs,
      rejectionReasons,
    };
  }

  private buildAIRecoverySummary(): AIRecoverySummary {
    const events = this.records.flatMap(
      record => record.aiRecoveryEvents
    );

    const countStatus = (
      status: AIRecoveryAuditEvent["status"]
    ): number =>
      events.filter(event => event.status === status).length;

    const confidenceValues = events
      .map(event => event.confidence)
      .filter(
        (value): value is number =>
          typeof value === "number"
      );

    const averageConfidence =
      confidenceValues.length > 0
        ? Number(
            (
              confidenceValues.reduce(
                (sum, confidence) => sum + confidence,
                0
              ) / confidenceValues.length
            ).toFixed(3)
          )
        : null;

    return {
      totalEvaluations: events.length,
      suggested: countStatus("SUGGESTED"),
      noCandidate: countStatus("NO_CANDIDATE"),
      disabled: countStatus("DISABLED"),
      failed: countStatus("FAILED"),

      evaluatedCandidates: events.reduce(
        (sum, event) => sum + event.evaluatedCandidates,
        0
      ),

      averageConfidence,
      events,

      decisionAnalytics: this.buildDecisionSummary(events),
    };
  }

  /**
   * Generate the execution report.
   */
  onEnd(result: FullResult): void {
    if (this.records.length === 0) {
      console.log(
        "[AutoHeal QA] No test attempts recorded. " +
        "Preserving existing execution summary."
      );

      return;
    }

    const finishedAt = new Date();

    const healing = this.buildHealingSummary();
    const aiRecovery = this.buildAIRecoverySummary();

    const summary = {
      framework: "AutoHeal QA",
      startedAt: this.startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      overallStatus: result.status,

      totalAttempts: this.records.length,

      passedAttempts: this.records.filter(
        record => record.status === "passed"
      ).length,

      failedAttempts: this.records.filter(
        record => record.status === "failed"
      ).length,

      skippedAttempts: this.records.filter(
        record => record.status === "skipped"
      ).length,

      timedOutAttempts: this.records.filter(
        record => record.status === "timedOut"
      ).length,

      interruptedAttempts: this.records.filter(
        record => record.status === "interrupted"
      ).length,

      healing,
      aiRecovery,
      tests: this.records,
    };

    const outputDirectory = path.resolve(
      "reports",
      "autoheal"
    );

    fs.mkdirSync(outputDirectory, {
      recursive: true,
    });

    const outputFile = path.join(
      outputDirectory,
      "summary.json"
    );

    const tempFile = path.join(
      outputDirectory,
      `summary.${process.pid}.tmp`
    );

    try {
      fs.writeFileSync(
        tempFile,
        JSON.stringify(summary, null, 2) + "\n",
        "utf8"
      );

      fs.renameSync(tempFile, outputFile);
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.rmSync(tempFile, {
          force: true,
        });
      }
    }

    console.log(
      `[AutoHeal QA] Report saved: ${outputFile}`
    );

    console.log(
      `[AutoHeal QA] Total attempts: ${summary.totalAttempts}`
    );

    console.log(
      `[AutoHeal QA] Passed attempts: ${summary.passedAttempts}`
    );

    console.log(
      `[AutoHeal QA] Failed attempts: ${summary.failedAttempts}`
    );

    console.log(
      `[AutoHeal QA] Healing events: ${healing.totalEvents}`
    );

    console.log(
      `[AutoHeal QA] Healed attempts: ${healing.healedAttempts}`
    );

    if (healing.averageConfidence !== null) {
      console.log(
        `[AutoHeal QA] Average healing confidence: ${healing.averageConfidence}`
      );
    }

    console.log(
      `[AutoHeal QA] AI recovery evaluations: ${aiRecovery.totalEvaluations}`
    );

    console.log(
      `[AutoHeal QA] AI suggestions: ${aiRecovery.suggested}`
    );

    console.log(
      `[AutoHeal QA] AI recovery no-candidate results: ${aiRecovery.noCandidate}`
    );

    console.log(
      `[AutoHeal QA] AI recovery disabled results: ${aiRecovery.disabled}`
    );

    console.log(
      `[AutoHeal QA] AI recovery failures: ${aiRecovery.failed}`
    );

    console.log(
      `[AutoHeal QA] AI evaluated candidates: ${aiRecovery.evaluatedCandidates}`
    );

    if (aiRecovery.averageConfidence !== null) {
      console.log(
        `[AutoHeal QA] Average AI suggestion confidence: ${aiRecovery.averageConfidence}`
      );
    }

    const decisions = aiRecovery.decisionAnalytics;

    console.log(
      `[AutoHeal QA] AI analytics events: ${decisions.eventsWithAnalytics}`
    );

    console.log(
      `[AutoHeal QA] AI accepted candidates: ${decisions.acceptedCandidates}`
    );

    console.log(
      `[AutoHeal QA] AI rejected candidates: ${decisions.rejectedCandidates}`
    );

    console.log(
      `[AutoHeal QA] AI not-evaluated candidates: ${decisions.notEvaluatedCandidates}`
    );

    console.log(
      `[AutoHeal QA] AI total validation duration: ${decisions.totalValidationDurationMs} ms`
    );

    if (decisions.averageValidationDurationMs !== null) {
      console.log(
        `[AutoHeal QA] AI average validation duration: ${decisions.averageValidationDurationMs} ms`
      );
    }
  }
}

export default AutoHealReporter;

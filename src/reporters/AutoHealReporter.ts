
import type {
  Reporter,
  FullResult,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

import fs from "node:fs";
import path from "node:path";

import type { AIRecoveryAuditEvent } from "../ai/AIRecoveryAudit";

/**
 * Deterministic locator healing event.
 */
export type HealingAuditEvent = {
  event: "LOCATOR_HEALED";
  timestamp: string;
  primarySelector: string;
  recoveredSelector: string;
  strategy: string;
  confidence: number;
};

/**
 * Individual Playwright test attempt.
 */
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

/**
 * Existing deterministic healing summary.
 * Keep this structure backward compatible.
 */
export type HealingSummary = {
  totalEvents: number;
  healedAttempts: number;
  averageConfidence: number | null;
  events: HealingAuditEvent[];
};

/**
 * Phase 3.7 AI recovery analytics.
 *
 * AI suggestions are advisory.
 * They are not counted as healed locators.
 */
export type AIRecoverySummary = {
  totalEvaluations: number;
  suggested: number;
  noCandidate: number;
  disabled: number;
  failed: number;
  evaluatedCandidates: number;
  averageConfidence: number | null;
  events: AIRecoveryAuditEvent[];
};

class AutoHealReporter implements Reporter {
  private readonly records: TestRecord[] = [];

  private startedAt = new Date();

  /**
   * Initialize a new test execution.
   */
  onBegin(): void {
    this.records.length = 0;
    this.startedAt = new Date();

    console.log(
      "[AutoHeal QA] Reporter initialized"
    );
  }

  /**
   * Validate a deterministic healing audit event.
   */
  private isHealingAuditEvent(
    value: unknown
  ): value is HealingAuditEvent {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value)
    ) {
      return false;
    }

    const event = value as Record<string, unknown>;

    return (
      event.event === "LOCATOR_HEALED" &&
      typeof event.timestamp === "string" &&
      typeof event.primarySelector === "string" &&
      typeof event.recoveredSelector === "string" &&
      typeof event.strategy === "string" &&
      typeof event.confidence === "number" &&
      Number.isFinite(event.confidence) &&
      event.confidence >= 0 &&
      event.confidence <= 1
    );
  }

  /**
   * Validate a Phase 3.7 AI recovery audit event.
   */
  private isAIRecoveryAuditEvent(
    value: unknown
  ): value is AIRecoveryAuditEvent {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value)
    ) {
      return false;
    }

    const event = value as Record<string, unknown>;

    const validStatuses = [
      "SUGGESTED",
      "NO_CANDIDATE",
      "DISABLED",
      "FAILED",
    ];

    return (
      event.event === "AI_RECOVERY_EVALUATED" &&
      typeof event.timestamp === "string" &&
      validStatuses.includes(String(event.status)) &&
      typeof event.provider === "string" &&
      typeof event.evaluatedCandidates === "number" &&
      Number.isSafeInteger(event.evaluatedCandidates) &&
      event.evaluatedCandidates >= 0 &&
      (
        event.reason === undefined ||
        typeof event.reason === "string"
      ) &&
      (
        event.confidence === undefined ||
        (
          typeof event.confidence === "number" &&
          Number.isFinite(event.confidence) &&
          event.confidence >= 0 &&
          event.confidence <= 1
        )
      )
    );
  }

  /**
   * Read the JSON content of a Playwright attachment.
   *
   * Attachments can contain an in-memory body
   * or a filesystem path.
   */
  private readAttachment(
    attachment: TestResult["attachments"][number]
  ): unknown | null {
    try {
      let raw: string;

      if (attachment.body) {
        raw = attachment.body.toString("utf8");
      } else if (attachment.path) {
        raw = fs.readFileSync(
          attachment.path,
          "utf8"
        );
      } else {
        return null;
      }

      return JSON.parse(raw) as unknown;
    } catch (error) {
      console.warn(
        "[AutoHeal QA] Failed to parse audit attachment:",
        error
      );

      return null;
    }
  }

  /**
   * Extract trusted deterministic healing events.
   */
  private extractHealingEvents(
    result: TestResult
  ): HealingAuditEvent[] {
    const events: HealingAuditEvent[] = [];

    for (const attachment of result.attachments) {
      if (
        attachment.name !== "autoheal-healing-event"
      ) {
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
   * Extract advisory AI recovery evaluations.
   *
   * These events never indicate that an AI-generated
   * selector was automatically executed.
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

      if (this.isAIRecoveryAuditEvent(parsed)) {
        events.push(parsed);
      } else {
        console.warn(
          "[AutoHeal QA] Invalid AI recovery audit event structure"
        );
      }
    }

    return events;
  }

  /**
   * Record every Playwright test attempt.
   */
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

  /**
   * Aggregate deterministic healing events.
   *
   * Existing reporting behavior is preserved.
   */
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
                (sum, event) =>
                  sum + event.confidence,
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
   * Aggregate Phase 3.7 advisory AI recovery events.
   */
  private buildAIRecoverySummary(): AIRecoverySummary {
    const events = this.records.flatMap(
      record => record.aiRecoveryEvents
    );

    const countStatus = (
      status: AIRecoveryAuditEvent["status"]
    ): number => {
      return events.filter(
        event => event.status === status
      ).length;
    };

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
                (sum, confidence) =>
                  sum + confidence,
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
        (sum, event) =>
          sum + event.evaluatedCandidates,
        0
      ),

      averageConfidence,

      events,
    };
  }

  /**
   * Generate the complete AutoHeal QA execution report.
   */
  onEnd(result: FullResult): void {
    /**
     * Avoid overwriting the previous report
     * when Playwright only discovers tests.
     */
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

      /**
       * Existing deterministic healing section.
       */
      healing,

      /**
       * New Phase 3.7 advisory AI recovery section.
       */
      aiRecovery,

      /**
       * Individual test attempt details.
       */
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

    /**
     * Write the report using a temporary file
     * before replacing the final JSON report.
     */
    try {
      fs.writeFileSync(
        tempFile,
        JSON.stringify(summary, null, 2) + "\n",
        "utf8"
      );

      fs.renameSync(
        tempFile,
        outputFile
      );
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.rmSync(tempFile, {
          force: true,
        });
      }
    }

    /**
     * Execution statistics.
     */
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

    /**
     * Deterministic healing statistics.
     */
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

    /**
     * Phase 3.7 AI recovery statistics.
     */
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
  }
}

export default AutoHealReporter;

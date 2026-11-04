
import type {
  Reporter,
  FullResult,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

import fs from "node:fs";
import path from "node:path";

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
};

export type HealingSummary = {
  totalEvents: number;
  healedAttempts: number;
  averageConfidence: number | null;
  events: HealingAuditEvent[];
};

class AutoHealReporter implements Reporter {
  private readonly records: TestRecord[] = [];

  private startedAt = new Date();

  onBegin(): void {
    this.records.length = 0;
    this.startedAt = new Date();

    console.log("[AutoHeal QA] Reporter initialized");
  }

  private isHealingAuditEvent(
    value: unknown
  ): value is HealingAuditEvent {
    if (
      typeof value !== "object" ||
      value === null
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
          continue;
        }

        const parsed: unknown = JSON.parse(raw);

        if (this.isHealingAuditEvent(parsed)) {
          events.push(parsed);
        } else {
          console.warn(
            "[AutoHeal QA] Invalid healing audit event structure"
          );
        }
      } catch (error) {
        console.warn(
          "[AutoHeal QA] Failed to parse healing audit attachment:",
          error
        );
      }
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

  onEnd(result: FullResult): void {
    // Test discovery does not produce test attempts.
    // Never overwrite a real execution summary with
    // an empty report.
    if (this.records.length === 0) {
      console.log(
        "[AutoHeal QA] No test attempts recorded. " +
        "Preserving existing execution summary."
      );
      return;
    }

    const finishedAt = new Date();
    const healing = this.buildHealingSummary();

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
        fs.rmSync(tempFile, { force: true });
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
  }
}

export default AutoHealReporter;

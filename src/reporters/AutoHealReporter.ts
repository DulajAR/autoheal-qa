
import type {
  Reporter,
  FullResult,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

import fs from "node:fs";
import path from "node:path";

type TestRecord = {
  title: string;
  status: string;
  durationMs: number;
  retry: number;
  error?: string;
};

class AutoHealReporter implements Reporter {
  private readonly records: TestRecord[] = [];
  private startedAt = new Date();

  onBegin(): void {
    this.startedAt = new Date();
    console.log("[AutoHeal QA] Test execution started");
  }

  onTestEnd(
    test: TestCase,
    result: TestResult
  ): void {
    this.records.push({
      title: test.titlePath().join(" > "),
      status: result.status,
      durationMs: result.duration,
      retry: result.retry,
      error: result.error?.message,
    });
  }

  onEnd(result: FullResult): void {
    const finishedAt = new Date();

    const summary = {
      framework: "AutoHeal QA",
      startedAt: this.startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      overallStatus: result.status,
      totalAttempts: this.records.length,
      passedAttempts: this.records.filter(
        (record) => record.status === "passed"
      ).length,
      failedAttempts: this.records.filter(
        (record) => record.status === "failed"
      ).length,
      skippedAttempts: this.records.filter(
        (record) => record.status === "skipped"
      ).length,
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

    fs.writeFileSync(
      outputFile,
      JSON.stringify(summary, null, 2),
      "utf8"
    );

    console.log(
      `[AutoHeal QA] Report saved: ${outputFile}`
    );
  }
}

export default AutoHealReporter;

import { test, expect } from "@playwright/test";
import type { TestResult } from "@playwright/test/reporter";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import AutoHealReporter from "../../src/reporters/AutoHealReporter";
import type { AIRecoveryAuditEvent } from "../../src/ai/AIRecoveryAudit";

type ReporterInspection = {
  extractAIRecoveryEvents(result: TestResult): AIRecoveryAuditEvent[];
  buildAIRecoverySummary(): {
    totalEvaluations: number;
    suggested: number;
    noCandidate: number;
    evaluatedCandidates: number;
    decisionAnalytics: {
      eventsWithAnalytics: number;
      acceptedCandidates: number;
      rejectedCandidates: number;
      notEvaluatedCandidates: number;
    };
  };
  records: Array<{ aiRecoveryEvents: AIRecoveryAuditEvent[] }>;
};

const ID1 = "123e4567-e89b-42d3-a456-426614174000";
const ID2 = "123e4567-e89b-42d3-a456-426614174001";

function event(id: string = ID1): AIRecoveryAuditEvent {
  return {
    event: "AI_RECOVERY_EVALUATED",
    timestamp: "2026-11-13T00:00:00.000Z",
    status: "SUGGESTED",
    provider: "mock",
    evaluatedCandidates: 1,
    confidence: 0.95,
    recoveryId: id,
    diagnostics: {
      recoveryId: id,
      stage: "COMPLETED",
      durationMs: 10,
      timedOut: false,
    },
    analytics: {
      acceptedCandidates: 1,
      rejectedCandidates: 0,
      notEvaluatedCandidates: 2,
      validationDurationMs: 5,
      rejectionReasons: {},
    },
  };
}

function attachment(value: unknown) {
  return {
    name: "autoheal-ai-recovery-event",
    contentType: "application/json",
    body: Buffer.from(JSON.stringify(value)),
  };
}

function inspect() {
  return new AutoHealReporter() as unknown as ReporterInspection;
}

function extract(reporter: ReporterInspection, attachments: unknown[]) {
  return reporter.extractAIRecoveryEvents({ attachments } as TestResult);
}

test.describe("Phase 4.8 - Lifecycle Hardening", () => {
  test("RLH-001: malformed JSON does not prevent later valid events", () => {
    const reporter = inspect();
    const events = extract(reporter, [
      { name: "autoheal-ai-recovery-event", body: Buffer.from("{invalid") },
      attachment(event()),
    ]);
    expect(events).toHaveLength(1);
  });

  test("RLH-002: oversized in-memory attachment is rejected", () => {
    const reporter = inspect();
    const events = extract(reporter, [
      { name: "autoheal-ai-recovery-event", body: Buffer.alloc(1024 * 1024 + 1) },
      attachment(event()),
    ]);
    expect(events).toHaveLength(1);
  });

  test("RLH-003: exactly 1 MiB is parsed then schema-checked", () => {
    const reporter = inspect();
    const base = JSON.stringify({ ...event(), padding: "" });
    const payload = JSON.stringify({
      ...event(),
      padding: "x".repeat(1024 * 1024 - Buffer.byteLength(base)),
    });
    expect(Buffer.byteLength(payload)).toBe(1024 * 1024);
    const events = extract(reporter, [
      { name: "autoheal-ai-recovery-event", body: Buffer.from(payload) },
      attachment(event(ID2)),
    ]);
    expect(events).toHaveLength(2);
    expect(events.map(e => e.recoveryId)).toEqual([ID1, ID2]);
  });

  test("RLH-004: oversized file attachment is rejected", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "autoheal-audit-"));
    try {
      const file = path.join(dir, "large.json");
      fs.writeFileSync(file, Buffer.alloc(1024 * 1024 + 1));
      const events = extract(inspect(), [
        { name: "autoheal-ai-recovery-event", path: file },
        attachment(event()),
      ]);
      expect(events).toHaveLength(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("RLH-005: valid on-disk attachment remains supported", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "autoheal-audit-"));
    try {
      const file = path.join(dir, "valid.json");
      fs.writeFileSync(file, JSON.stringify(event()));
      const events = extract(inspect(), [
        { name: "autoheal-ai-recovery-event", path: file },
      ]);
      expect(events).toHaveLength(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("RLH-006: missing file does not prevent later valid event", () => {
    const events = extract(inspect(), [
      { name: "autoheal-ai-recovery-event", path: path.join(os.tmpdir(), "autoheal-no-such-file-123456789.json") },
      attachment(event()),
    ]);
    expect(events).toHaveLength(1);
  });

  test("RLH-007: mixed invalid and duplicate events count only once", () => {
    const events = extract(inspect(), [
      attachment({ ...event(), evaluatedCandidates: -1 }),
      attachment(event(ID1)),
      attachment(event(ID1)),
      attachment(event(ID2)),
    ]);
    expect(events.map(e => e.recoveryId)).toEqual([ID1, ID2]);
  });

  test("RLH-008: duplicate IDs are isolated across separate attempts", () => {
    const reporter = inspect();
    const first = extract(reporter, [attachment(event(ID1))]);
    const retry = extract(reporter, [attachment(event(ID1))]);
    expect(first).toHaveLength(1);
    expect(retry).toHaveLength(1);
  });

  test("RLH-009: rejected duplicates cannot inflate analytics", () => {
    const reporter = inspect();
    const accepted = extract(reporter, [
      attachment(event(ID1)), attachment(event(ID1)), attachment(event(ID2)),
    ]);
    reporter.records.push({ aiRecoveryEvents: accepted });
    const summary = reporter.buildAIRecoverySummary();
    expect(summary.totalEvaluations).toBe(2);
    expect(summary.suggested).toBe(2);
    expect(summary.evaluatedCandidates).toBe(2);
    expect(summary.decisionAnalytics.eventsWithAnalytics).toBe(2);
    expect(summary.decisionAnalytics.acceptedCandidates).toBe(2);
    expect(summary.decisionAnalytics.notEvaluatedCandidates).toBe(4);
  });

  test("RLH-010: legacy events and unknown attachment types remain compatible", () => {
    const legacy = {
      event: "AI_RECOVERY_EVALUATED",
      timestamp: "2026-11-13T00:00:00.000Z",
      status: "NO_CANDIDATE",
      provider: "mock",
      evaluatedCandidates: 0,
    };
    const events = extract(inspect(), [
      { name: "unrelated-attachment", body: Buffer.from("not json") },
      attachment(legacy), attachment(legacy),
    ]);
    expect(events).toHaveLength(2);
    expect(events.every(e => e.recoveryId === undefined)).toBe(true);
  });
});

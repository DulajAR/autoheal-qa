
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateReport,
} = require("../../scripts/validate-healing-report.cjs");

function createReport() {
  return {
    overallStatus: "passed",
    tests: [],
    healing: {
      totalEvents: 0,
      healedAttempts: 0,
      averageConfidence: null,
      events: [],
    },
    aiRecovery: {
      totalEvaluations: 0,
      suggested: 0,
      noCandidate: 0,
      disabled: 0,
      failed: 0,
      evaluatedCandidates: 0,
      averageConfidence: null,
      events: [],
    },
  };
}

function createAIEvent(status = "SUGGESTED") {
  return {
    event: "AI_RECOVERY_EVALUATED",
    timestamp: "2026-11-05T07:00:00Z",
    status,
    provider: "mock",
    evaluatedCandidates: 1,
    confidence: 0.95,
  };
}

function withAIEvent(report, event) {
  report.tests.push({
    title: "AI recovery regression",
    project: "chromium",
    status: "passed",
    healingEvents: [],
    aiRecoveryEvents: [event],
  });

  report.aiRecovery.events.push(event);
  report.aiRecovery.totalEvaluations = 1;
  report.aiRecovery.evaluatedCandidates =
    event.evaluatedCandidates;

  report.aiRecovery[event.status === "SUGGESTED"
    ? "suggested"
    : event.status === "FAILED"
      ? "failed"
      : event.status === "DISABLED"
        ? "disabled"
        : "noCandidate"] = 1;

  report.aiRecovery.averageConfidence =
    event.confidence ?? null;

  return report;
}

test("VAL-001: accepts empty valid report", () => {
  assert.doesNotThrow(() => {
    validateReport(createReport());
  });
});

test("VAL-002: rejects failed execution", () => {
  const report = createReport();
  report.overallStatus = "failed";

  assert.throws(
    () => validateReport(report),
    /Test execution must pass/
  );
});

test("VAL-003: rejects invalid AI status", () => {
  const report = withAIEvent(
    createReport(),
    createAIEvent()
  );

  report.aiRecovery.events[0].status = "UNKNOWN";

  assert.throws(
    () => validateReport(report),
    /Invalid AI recovery status/
  );
});

test("VAL-004: rejects invalid confidence", () => {
  const report = withAIEvent(
    createReport(),
    createAIEvent()
  );

  report.aiRecovery.events[0].confidence = 1.5;

  assert.throws(
    () => validateReport(report),
    /Invalid AI confidence/
  );
});

test("VAL-005: rejects sensitive selector fields", () => {
  const report = withAIEvent(
    createReport(),
    createAIEvent()
  );

  report.aiRecovery.events[0].suggestedSelector =
    "#private-selector";

  assert.throws(
    () => validateReport(report),
    /sensitive field/
  );
});

test("VAL-006: rejects inconsistent AI counts", () => {
  const report = withAIEvent(
    createReport(),
    createAIEvent()
  );

  report.aiRecovery.totalEvaluations = 2;

  assert.throws(
    () => validateReport(report),
    /AI recovery event count mismatch/
  );
});

test("VAL-007: accepts all four AI statuses", () => {
  for (const status of [
    "SUGGESTED",
    "NO_CANDIDATE",
    "DISABLED",
    "FAILED",
  ]) {
    const report = withAIEvent(
      createReport(),
      createAIEvent(status)
    );

    assert.doesNotThrow(() => validateReport(report));
  }
});

test("VAL-008: baseline rejects smaller report", () => {
  assert.throws(
    () => validateReport(createReport(), true),
    /Expected nine deterministic healing events/
  );
});

test("VAL-009: rejects invalid candidate counts", () => {
  const report = withAIEvent(
    createReport(),
    createAIEvent()
  );

  report.aiRecovery.events[0].evaluatedCandidates = -1;

  assert.throws(
    () => validateReport(report),
    /non-negative integer/
  );
});

test("VAL-010: rejects inconsistent per-test counts", () => {
  const report = withAIEvent(
    createReport(),
    createAIEvent()
  );

  report.tests[0].aiRecoveryEvents = [];

  assert.throws(
    () => validateReport(report),
    /Per-test AI recovery total mismatch/
  );
});

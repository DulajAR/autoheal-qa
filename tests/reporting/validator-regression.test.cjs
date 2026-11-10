"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { validateReport } = require("../../scripts/validate-healing-report.cjs");

function createReport() {
  return {
    overallStatus: "passed",
    tests: [],
    healing: { totalEvents: 0, healedAttempts: 0, averageConfidence: null, events: [] },
    aiRecovery: {
      totalEvaluations: 0, suggested: 0, noCandidate: 0, disabled: 0,
      failed: 0, evaluatedCandidates: 0, averageConfidence: null, events: [],
    },
  };
}

function createAIEvent(status = "SUGGESTED") {
  return {
    event: "AI_RECOVERY_EVALUATED",
    timestamp: "2026-11-05T07:00:00Z",
    status, provider: "mock", evaluatedCandidates: 1, confidence: 0.95,
  };
}

function withAIEvent(report, event) {
  report.tests.push({
    title: "AI recovery regression", project: "chromium", status: "passed",
    healingEvents: [], aiRecoveryEvents: [event],
  });
  report.aiRecovery.events.push(event);
  report.aiRecovery.totalEvaluations = 1;
  report.aiRecovery.evaluatedCandidates = event.evaluatedCandidates;
  report.aiRecovery[event.status === "SUGGESTED" ? "suggested"
    : event.status === "FAILED" ? "failed"
      : event.status === "DISABLED" ? "disabled" : "noCandidate"] = 1;
  report.aiRecovery.averageConfidence = event.confidence ?? null;
  return report;
}

function createDecisionAnalytics(overrides = {}) {
  return {
    acceptedCandidates: 1,
    rejectedCandidates: 1,
    notEvaluatedCandidates: 1,
    validationDurationMs: 120,
    rejectionReasons: { NO_MATCH: 1 },
    ...overrides,
  };
}

function createDecisionSummary(overrides = {}) {
  return {
    eventsWithAnalytics: 1,
    acceptedCandidates: 1,
    rejectedCandidates: 1,
    notEvaluatedCandidates: 1,
    totalValidationDurationMs: 120,
    averageValidationDurationMs: 120,
    rejectionReasons: { NO_MATCH: 1 },
    ...overrides,
  };
}

function withDecisionAnalytics() {
  const event = createAIEvent();
  event.evaluatedCandidates = 3;
  event.analytics = createDecisionAnalytics();
  const report = withAIEvent(createReport(), event);
  report.aiRecovery.decisionAnalytics = createDecisionSummary();
  return report;
}

test("VAL-001: accepts empty valid report", () => {
  assert.doesNotThrow(() => validateReport(createReport()));
});

test("VAL-002: rejects failed execution", () => {
  const report = createReport();
  report.overallStatus = "failed";
  assert.throws(() => validateReport(report), /Test execution must pass/);
});

test("VAL-003: rejects invalid AI status", () => {
  const report = withAIEvent(createReport(), createAIEvent());
  report.aiRecovery.events[0].status = "UNKNOWN";
  assert.throws(() => validateReport(report), /Invalid AI recovery status/);
});

test("VAL-004: rejects invalid confidence", () => {
  const report = withAIEvent(createReport(), createAIEvent());
  report.aiRecovery.events[0].confidence = 1.5;
  assert.throws(() => validateReport(report), /Invalid AI confidence/);
});

test("VAL-005: rejects sensitive selector fields", () => {
  const report = withAIEvent(createReport(), createAIEvent());
  report.aiRecovery.events[0].suggestedSelector = "#private-selector";
  assert.throws(() => validateReport(report), /sensitive field/);
});

test("VAL-006: rejects inconsistent AI counts", () => {
  const report = withAIEvent(createReport(), createAIEvent());
  report.aiRecovery.totalEvaluations = 2;
  assert.throws(() => validateReport(report), /AI recovery event count mismatch/);
});

test("VAL-007: accepts all four AI statuses", () => {
  for (const status of ["SUGGESTED", "NO_CANDIDATE", "DISABLED", "FAILED"]) {
    const report = withAIEvent(createReport(), createAIEvent(status));
    assert.doesNotThrow(() => validateReport(report));
  }
});

test("VAL-008: baseline rejects smaller report", () => {
  assert.throws(() => validateReport(createReport(), true),
    /Expected nine deterministic healing events/);
});

test("VAL-009: rejects invalid candidate counts", () => {
  const report = withAIEvent(createReport(), createAIEvent());
  report.aiRecovery.events[0].evaluatedCandidates = -1;
  assert.throws(() => validateReport(report), /non-negative integer/);
});

test("VAL-010: rejects inconsistent per-test counts", () => {
  const report = withAIEvent(createReport(), createAIEvent());
  report.tests[0].aiRecoveryEvents = [];
  assert.throws(() => validateReport(report), /Per-test AI recovery total mismatch/);
});

test("VAL-011: accepts valid AI decision analytics", () => {
  assert.doesNotThrow(() => validateReport(withDecisionAnalytics()));
});

test("VAL-012: accepts legacy report without decision analytics", () => {
  const report = withAIEvent(createReport(), createAIEvent());
  assert.doesNotThrow(() => validateReport(report));
});

test("VAL-013: rejects negative decision candidate count", () => {
  const report = withDecisionAnalytics();
  report.aiRecovery.events[0].analytics.rejectedCandidates = -1;
  assert.throws(() => validateReport(report), /non-negative integer/);
});

test("VAL-014: rejects inconsistent decision candidate totals", () => {
  const report = withDecisionAnalytics();
  report.aiRecovery.events[0].analytics.notEvaluatedCandidates = 0;
  assert.throws(() => validateReport(report), /AI decision candidate counts mismatch/);
});

test("VAL-015: rejects unknown rejection reason", () => {
  const report = withDecisionAnalytics();
  report.aiRecovery.events[0].analytics.rejectionReasons = { UNKNOWN_REASON: 1 };
  assert.throws(() => validateReport(report), /Unknown AI rejection reason/);
});

test("VAL-016: rejects invalid validation duration", () => {
  const report = withDecisionAnalytics();
  report.aiRecovery.events[0].analytics.validationDurationMs = -5;
  assert.throws(() => validateReport(report), /finite non-negative number/);
});

test("VAL-017: rejects mismatched summary accepted candidates", () => {
  const report = withDecisionAnalytics();
  report.aiRecovery.decisionAnalytics.acceptedCandidates = 2;
  assert.throws(() => validateReport(report), /acceptedCandidates mismatch/);
});

test("VAL-018: rejects mismatched summary validation duration", () => {
  const report = withDecisionAnalytics();
  report.aiRecovery.decisionAnalytics.totalValidationDurationMs = 999;
  assert.throws(() => validateReport(report), /total validation duration mismatch/);
});

test("VAL-019: rejects mismatched average validation duration", () => {
  const report = withDecisionAnalytics();
  report.aiRecovery.decisionAnalytics.averageValidationDurationMs = 99;
  assert.throws(() => validateReport(report), /average validation duration mismatch/);
});

test("VAL-020: rejects mismatched rejection reason totals", () => {
  const report = withDecisionAnalytics();
  report.aiRecovery.decisionAnalytics.rejectionReasons = { NO_MATCH: 0 };
  assert.throws(() => validateReport(report), /rejection reason totals mismatch/);
});

test("VAL-021: rejects sensitive fields in nested analytics", () => {
  const report = withDecisionAnalytics();
  report.aiRecovery.events[0].analytics.rawDOM = "private DOM";
  assert.throws(() => validateReport(report), /sensitive field/);
});

test("VAL-022: requires summary when event analytics exist", () => {
  const report = withDecisionAnalytics();
  delete report.aiRecovery.decisionAnalytics;
  assert.throws(() => validateReport(report), /summary missing for events with analytics/);
});

test("VAL-023: rejects mismatched per-test decision analytics", () => {
  const report = withDecisionAnalytics();
  report.tests[0].aiRecoveryEvents = [
    { ...report.aiRecovery.events[0], analytics: createDecisionAnalytics({
      validationDurationMs: 120,
      acceptedCandidates: 0,
      rejectedCandidates: 2,
      notEvaluatedCandidates: 1,
      rejectionReasons: { NO_MATCH: 2 },
    }) },
  ];
  assert.throws(() => validateReport(report), /Per-test AI analytics .* mismatch/);
});

test("VAL-024: accepts zero-event decision summary", () => {
  const report = createReport();
  report.aiRecovery.decisionAnalytics = {
    eventsWithAnalytics: 0,
    acceptedCandidates: 0,
    rejectedCandidates: 0,
    notEvaluatedCandidates: 0,
    totalValidationDurationMs: 0,
    averageValidationDurationMs: null,
    rejectionReasons: {},
  };
  assert.doesNotThrow(() => validateReport(report));
});

test("VAL-025: rejects non-null average without analytics events", () => {
  const report = createReport();
  report.aiRecovery.decisionAnalytics = {
    eventsWithAnalytics: 0,
    acceptedCandidates: 0,
    rejectedCandidates: 0,
    notEvaluatedCandidates: 0,
    totalValidationDurationMs: 0,
    averageValidationDurationMs: 0,
    rejectionReasons: {},
  };
  assert.throws(() => validateReport(report), /must be null without analytics events/);
});


"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateExternalReport,
} = require("../../scripts/validate-external-report.cjs");

function createValidReport() {
  const tests = Array.from({ length: 10 }, (_, index) => {
    const id = `EXT-${String(index + 1).padStart(3, "0")}`;

    return {
      title: ` > chromium > saucedemo.spec.ts > ${id}: test`,
      project: "chromium",
      status: "passed",
      durationMs: 100,
      retry: 0,
      healingEvents: [],
      aiRecoveryEvents: [],
    };
  });

  const healingEvents = [
    {
      event: "LOCATOR_HEALED",
      primarySelector: "#missing-button",
      recoveredSelector: "#login-button",
      strategy: "trusted fallback",
      confidence: 0.95,
    },
    {
      event: "LOCATOR_HEALED",
      primarySelector: "#old-button",
      recoveredSelector: "#login-button",
      strategy: "trusted fallback",
      confidence: 0.95,
    },
  ];

  tests[5].healingEvents.push(healingEvents[0]);
  tests[9].healingEvents.push(healingEvents[1]);

  const aiEvent = {
    event: "AI_RECOVERY_EVALUATED",
    timestamp: "2026-11-18T09:00:00.000Z",
    status: "SUGGESTED",
    provider: "mock",
    evaluatedCandidates: 1,
    confidence: 0.95,
  };

  tests[8].aiRecoveryEvents.push(aiEvent);

  return {
    framework: "AutoHeal QA",
    overallStatus: "passed",

    totalAttempts: 10,
    passedAttempts: 10,
    failedAttempts: 0,
    skippedAttempts: 0,
    timedOutAttempts: 0,
    interruptedAttempts: 0,

    healing: {
      totalEvents: 2,
      healedAttempts: 2,
      averageConfidence: 0.95,
      events: healingEvents,
    },

    aiRecovery: {
      totalEvaluations: 1,
      suggested: 1,
      noCandidate: 0,
      disabled: 0,
      failed: 0,
      evaluatedCandidates: 1,
      averageConfidence: 0.95,
      events: [aiEvent],
    },

    tests,
  };
}

test("EXTVAL-001: accepts valid external report", () => {
  const result = validateExternalReport(createValidReport());

  assert.equal(result.tests, 10);
  assert.equal(result.healingEvents, 2);
  assert.equal(result.aiEvaluations, 1);
});

test("EXTVAL-002: rejects missing external test", () => {
  const report = createValidReport();

  report.tests.pop();
  report.totalAttempts = 9;
  report.passedAttempts = 9;

  assert.throws(() => validateExternalReport(report));
});

test("EXTVAL-003: rejects duplicate test IDs", () => {
  const report = createValidReport();

  report.tests[1].title = report.tests[0].title;

  assert.throws(
    () => validateExternalReport(report),
    /coverage mismatch/
  );
});

test("EXTVAL-004: rejects failed attempts", () => {
  const report = createValidReport();

  report.failedAttempts = 1;
  report.passedAttempts = 9;

  assert.throws(() => validateExternalReport(report));
});

test("EXTVAL-005: rejects failed test status", () => {
  const report = createValidReport();

  report.tests[0].status = "failed";

  assert.throws(() => validateExternalReport(report));
});

test("EXTVAL-006: rejects missing healing event", () => {
  const report = createValidReport();

  report.tests[5].healingEvents = [];
  report.healing.events = [report.healing.events[1]];
  report.healing.totalEvents = 1;
  report.healing.healedAttempts = 1;

  assert.throws(
    () => validateExternalReport(report),
    /EXT-006 must record a healing event/
  );
});

test("EXTVAL-007: rejects missing AI suggestion", () => {
  const report = createValidReport();

  report.tests[8].aiRecoveryEvents = [];
  report.aiRecovery.events = [];
  report.aiRecovery.totalEvaluations = 0;
  report.aiRecovery.suggested = 0;
  report.aiRecovery.evaluatedCandidates = 0;
  report.aiRecovery.averageConfidence = null;

  assert.throws(
    () => validateExternalReport(report),
    /EXT-009 must record an AI suggestion/
  );
});

test("EXTVAL-008: rejects automatic healing in AI advisory test", () => {
  const report = createValidReport();

  const extraHealing = {
    event: "LOCATOR_HEALED",
    primarySelector: "#ai-button",
    recoveredSelector: "#login-button",
    strategy: "automatic AI recovery",
    confidence: 0.95,
  };

  report.tests[8].healingEvents.push(extraHealing);
  report.healing.events.push(extraHealing);
  report.healing.totalEvents = 3;
  report.healing.healedAttempts = 3;

  assert.throws(
    () => validateExternalReport(report),
    /must not record automatic locator healing/
  );
});

test("EXTVAL-009: rejects incorrect healing totals", () => {
  const report = createValidReport();

  report.healing.totalEvents = 3;

  assert.throws(() => validateExternalReport(report));
});

test("EXTVAL-010: rejects invalid test duration", () => {
  const report = createValidReport();

  report.tests[0].durationMs = -100;

  assert.throws(
    () => validateExternalReport(report),
    /Invalid test duration/
  );
});

test("EXTVAL-011: rejects invalid retry count", () => {
  const report = createValidReport();

  report.tests[0].retry = -1;

  assert.throws(
    () => validateExternalReport(report),
    /Invalid retry count/
  );
});

test("EXTVAL-012: rejects incorrect browser project", () => {
  const report = createValidReport();

  report.tests[0].project = "firefox";

  assert.throws(() => validateExternalReport(report));
});

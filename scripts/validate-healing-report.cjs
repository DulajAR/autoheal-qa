
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const args = process.argv.slice(2);
const baseline = args.includes("--baseline");
const paths = args.filter(arg => arg !== "--baseline");

if (paths.length > 1) {
  console.error(
    "Usage: node scripts/validate-healing-report.cjs [report.json] [--baseline]"
  );
  process.exit(1);
}

const reportPath = path.resolve(
  paths[0] || "reports/autoheal/summary.json"
);

const validStatuses = new Set([
  "SUGGESTED",
  "NO_CANDIDATE",
  "DISABLED",
  "FAILED",
]);

const privateAIFields = [
  "primarySelector",
  "suggestedSelector",
  "recoveredSelector",
  "rawDOM",
  "rawDom",
  "outerHTML",
  "innerHTML",
  "html",
  "domSnapshot",
  "pageSource",
];

function isRecord(value) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function nonNegativeInteger(value, name) {
  assert.ok(
    Number.isSafeInteger(value) && value >= 0,
    `${name} must be a non-negative integer`
  );
}

function confidence(value, name, minimum = 0) {
  assert.ok(
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= 1,
    `Invalid ${name}`
  );
}

function average(values) {
  return values.length
    ? Number(
        (
          values.reduce((sum, value) => sum + value, 0) /
          values.length
        ).toFixed(3)
      )
    : null;
}

function validateHealingEvent(event) {
  assert.ok(isRecord(event), "Invalid healing event");

  assert.equal(event.event, "LOCATOR_HEALED");

  for (const field of [
    "primarySelector",
    "recoveredSelector",
    "strategy",
  ]) {
    assert.ok(
      typeof event[field] === "string" &&
      event[field].length > 0,
      `Invalid healing ${field}`
    );
  }

  confidence(
    event.confidence,
    "deterministic healing confidence",
    0.85
  );
}

function validateAIEvent(event) {
  assert.ok(isRecord(event), "Invalid AI recovery event");

  assert.equal(
    event.event,
    "AI_RECOVERY_EVALUATED"
  );

  assert.ok(
    typeof event.timestamp === "string" &&
    Number.isFinite(Date.parse(event.timestamp)),
    "Invalid AI event timestamp"
  );

  assert.ok(
    validStatuses.has(event.status),
    "Invalid AI recovery status"
  );

  assert.ok(
    typeof event.provider === "string" &&
    event.provider.length > 0,
    "Invalid AI provider"
  );

  nonNegativeInteger(
    event.evaluatedCandidates,
    "AI evaluatedCandidates"
  );

  assert.ok(
    event.reason === undefined ||
    typeof event.reason === "string",
    "Invalid AI recovery reason"
  );

  if (event.confidence !== undefined) {
    confidence(event.confidence, "AI confidence");
  }

  for (const field of privateAIFields) {
    assert.equal(
      Object.hasOwn(event, field),
      false,
      `AI audit event exposes sensitive field: ${field}`
    );
  }
}

function validateReport(report, useBaseline = false) {
  assert.ok(isRecord(report), "Invalid report object");

  assert.equal(
    report.overallStatus,
    "passed",
    "Test execution must pass"
  );

  assert.ok(
    Array.isArray(report.tests),
    "Test records must be an array"
  );

  assert.ok(
    isRecord(report.healing),
    "Deterministic healing summary is missing"
  );

  assert.ok(
    isRecord(report.aiRecovery),
    "AI recovery summary is missing"
  );

  const healing = report.healing;
  const ai = report.aiRecovery;

  nonNegativeInteger(
    healing.totalEvents,
    "Healing totalEvents"
  );

  nonNegativeInteger(
    healing.healedAttempts,
    "Healing healedAttempts"
  );

  assert.ok(
    Array.isArray(healing.events),
    "Healing events must be an array"
  );

  assert.equal(
    healing.events.length,
    healing.totalEvents,
    "Healing event count mismatch"
  );

  assert.ok(
    healing.healedAttempts <= report.tests.length,
    "Healed attempts exceed test records"
  );

  for (const event of healing.events) {
    validateHealingEvent(event);
  }

  const healingAverage = average(
    healing.events.map(event => event.confidence)
  );

  assert.equal(
    healing.averageConfidence,
    healingAverage,
    "Unexpected deterministic healing confidence"
  );

  assert.ok(
    Array.isArray(ai.events),
    "AI recovery events must be an array"
  );

  for (const field of [
    "totalEvaluations",
    "suggested",
    "noCandidate",
    "disabled",
    "failed",
    "evaluatedCandidates",
  ]) {
    nonNegativeInteger(ai[field], `AI ${field}`);
  }

  assert.equal(
    ai.events.length,
    ai.totalEvaluations,
    "AI recovery event count mismatch"
  );

  const statusCounts = {
    SUGGESTED: 0,
    NO_CANDIDATE: 0,
    DISABLED: 0,
    FAILED: 0,
  };

  let evaluatedCandidates = 0;
  const confidenceValues = [];

  for (const event of ai.events) {
    validateAIEvent(event);

    statusCounts[event.status] += 1;
    evaluatedCandidates += event.evaluatedCandidates;

    if (event.confidence !== undefined) {
      confidenceValues.push(event.confidence);
    }
  }

  assert.equal(statusCounts.SUGGESTED, ai.suggested);
  assert.equal(statusCounts.NO_CANDIDATE, ai.noCandidate);
  assert.equal(statusCounts.DISABLED, ai.disabled);
  assert.equal(statusCounts.FAILED, ai.failed);

  assert.equal(
    evaluatedCandidates,
    ai.evaluatedCandidates,
    "AI evaluated candidate total mismatch"
  );

  assert.equal(
    average(confidenceValues),
    ai.averageConfidence,
    "AI average confidence mismatch"
  );

  let perTestHealing = 0;
  let perTestAI = 0;
  let healedAttempts = 0;

  for (const test of report.tests) {
    assert.ok(
      isRecord(test),
      "Invalid test record"
    );

    assert.ok(
      Array.isArray(test.healingEvents),
      "Missing per-test healing events"
    );

    assert.ok(
      Array.isArray(test.aiRecoveryEvents),
      "Missing per-test AI recovery events"
    );

    for (const event of test.healingEvents) {
      validateHealingEvent(event);
    }

    for (const event of test.aiRecoveryEvents) {
      validateAIEvent(event);
    }

    perTestHealing += test.healingEvents.length;
    perTestAI += test.aiRecoveryEvents.length;

    if (test.healingEvents.length > 0) {
      healedAttempts += 1;
    }
  }

  assert.equal(
    perTestHealing,
    healing.totalEvents,
    "Per-test deterministic healing total mismatch"
  );

  assert.equal(
    perTestAI,
    ai.totalEvaluations,
    "Per-test AI recovery total mismatch"
  );

  assert.equal(
    healedAttempts,
    healing.healedAttempts,
    "Healed attempts mismatch"
  );

  if (useBaseline) {
    assert.equal(
      healing.totalEvents,
      9,
      "Expected nine deterministic healing events"
    );

    assert.equal(healing.healedAttempts, 9);
    assert.equal(healing.averageConfidence, 0.95);

    assert.equal(
      ai.totalEvaluations,
      6,
      "Expected six AI recovery evaluations"
    );

    assert.equal(ai.suggested, 3);
    assert.equal(ai.failed, 3);
    assert.equal(ai.noCandidate, 0);
    assert.equal(ai.disabled, 0);
    assert.equal(ai.evaluatedCandidates, 3);
    assert.equal(ai.averageConfidence, 0.95);
  }

  return {
    healingEvents: healing.totalEvents,
    aiEvaluations: ai.totalEvaluations,
    aiSuggestions: ai.suggested,
    aiFailures: ai.failed,
    tests: report.tests.length,
  };
}

function main() {
  assert.ok(
    fs.existsSync(reportPath),
    `AutoHeal report does not exist: ${reportPath}`
  );

  const report = JSON.parse(
    fs.readFileSync(reportPath, "utf8")
  );

  const result = validateReport(report, baseline);

  console.log(
    "[AutoHeal QA] Report validation passed!"
  );

  console.log(
    `[AutoHeal QA] Mode: ${baseline ? "baseline" : "standard"}`
  );

  console.log(
    `[AutoHeal QA] Test records: ${result.tests}`
  );

  console.log(
    `[AutoHeal QA] Healing events: ${result.healingEvents}`
  );

  console.log(
    `[AutoHeal QA] AI evaluations: ${result.aiEvaluations}`
  );

  console.log(
    `[AutoHeal QA] AI suggestions: ${result.aiSuggestions}`
  );

  console.log(
    `[AutoHeal QA] AI failures: ${result.aiFailures}`
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(
      `[AutoHeal QA] Validation failed: ${error.message}`
    );
    process.exitCode = 1;
  }
}

module.exports = {
  validateReport,
  validateHealingEvent,
  validateAIEvent,
};

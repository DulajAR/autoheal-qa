
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const reportPath = path.resolve(
  "reports",
  "autoheal",
  "summary.json"
);

assert.ok(
  fs.existsSync(reportPath),
  "AutoHeal report does not exist"
);

const report = JSON.parse(
  fs.readFileSync(reportPath, "utf8")
);

// --------------------------------------------------
// 1. Overall execution validation
// --------------------------------------------------

assert.equal(
  report.overallStatus,
  "passed",
  "Test execution must pass"
);

assert.ok(
  Array.isArray(report.tests),
  "Test records must be an array"
);

// --------------------------------------------------
// 2. Deterministic healing validation
// --------------------------------------------------

assert.ok(
  report.healing,
  "Deterministic healing summary is missing"
);

assert.equal(
  report.healing.totalEvents,
  9,
  "Expected nine deterministic healing events"
);

assert.equal(
  report.healing.healedAttempts,
  9,
  "Expected nine healed attempts"
);

assert.equal(
  report.healing.averageConfidence,
  0.95,
  "Unexpected deterministic healing confidence"
);

assert.ok(
  Array.isArray(report.healing.events),
  "Healing events must be an array"
);

assert.equal(
  report.healing.events.length,
  report.healing.totalEvents,
  "Healing event count mismatch"
);

for (const event of report.healing.events) {
  assert.equal(
    event.event,
    "LOCATOR_HEALED"
  );

  assert.ok(event.primarySelector);
  assert.ok(event.recoveredSelector);
  assert.ok(event.strategy);

  assert.ok(
    event.confidence >= 0.85 &&
    event.confidence <= 1,
    "Invalid deterministic healing confidence"
  );
}

// --------------------------------------------------
// 3. AI recovery reporting validation
// --------------------------------------------------

assert.ok(
  report.aiRecovery,
  "AI recovery summary is missing"
);

const ai = report.aiRecovery;

assert.equal(
  ai.totalEvaluations,
  6,
  "Expected six AI recovery evaluations"
);

assert.equal(
  ai.suggested,
  3,
  "Expected three AI suggestions"
);

assert.equal(
  ai.failed,
  3,
  "Expected three AI recovery failures"
);

assert.equal(
  ai.noCandidate,
  0,
  "Unexpected AI no-candidate count"
);

assert.equal(
  ai.disabled,
  0,
  "Unexpected AI disabled count"
);

assert.equal(
  ai.evaluatedCandidates,
  3,
  "Expected three evaluated AI candidates"
);

assert.equal(
  ai.averageConfidence,
  0.95,
  "Unexpected average AI confidence"
);

assert.ok(
  Array.isArray(ai.events),
  "AI recovery events must be an array"
);

assert.equal(
  ai.events.length,
  ai.totalEvaluations,
  "AI recovery event count mismatch"
);

assert.equal(
  ai.suggested +
  ai.noCandidate +
  ai.disabled +
  ai.failed,
  ai.totalEvaluations,
  "AI recovery status totals do not match"
);

// --------------------------------------------------
// 4. AI audit event schema validation
// --------------------------------------------------

const validStatuses = new Set([
  "SUGGESTED",
  "NO_CANDIDATE",
  "DISABLED",
  "FAILED",
]);

const statusCounts = {
  SUGGESTED: 0,
  NO_CANDIDATE: 0,
  DISABLED: 0,
  FAILED: 0,
};

let evaluatedCandidates = 0;
const confidenceValues = [];

for (const event of ai.events) {
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

  assert.ok(
    Number.isSafeInteger(event.evaluatedCandidates) &&
    event.evaluatedCandidates >= 0,
    "Invalid evaluated candidate count"
  );

  assert.ok(
    event.reason === undefined ||
    typeof event.reason === "string",
    "Invalid AI recovery reason"
  );

  if (event.confidence !== undefined) {
    assert.ok(
      typeof event.confidence === "number" &&
      Number.isFinite(event.confidence) &&
      event.confidence >= 0 &&
      event.confidence <= 1,
      "Invalid AI confidence"
    );

    confidenceValues.push(event.confidence);
  }

  // AI audit events must never expose raw DOM
  // or selector suggestions.
  assert.equal(
    Object.hasOwn(event, "primarySelector"),
    false,
    "AI audit event exposes a primary selector"
  );

  assert.equal(
    Object.hasOwn(event, "suggestedSelector"),
    false,
    "AI audit event exposes a suggested selector"
  );

  assert.equal(
    Object.hasOwn(event, "rawDOM"),
    false,
    "AI audit event exposes raw DOM"
  );

  statusCounts[event.status] += 1;

  evaluatedCandidates += event.evaluatedCandidates;
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

const calculatedAverage =
  confidenceValues.length > 0
    ? Number(
        (
          confidenceValues.reduce(
            (sum, value) => sum + value,
            0
          ) / confidenceValues.length
        ).toFixed(3)
      )
    : null;

assert.equal(
  calculatedAverage,
  ai.averageConfidence,
  "AI average confidence mismatch"
);

// --------------------------------------------------
// 5. Cross-check per-test reporting
// --------------------------------------------------

const testHealingEvents = report.tests.reduce(
  (sum, test) => {
    assert.ok(
      Array.isArray(test.healingEvents),
      "Missing per-test healing events"
    );

    assert.ok(
      Array.isArray(test.aiRecoveryEvents),
      "Missing per-test AI recovery events"
    );

    return sum + test.healingEvents.length;
  },
  0
);

const testAIEvents = report.tests.reduce(
  (sum, test) =>
    sum + test.aiRecoveryEvents.length,
  0
);

assert.equal(
  testHealingEvents,
  report.healing.totalEvents,
  "Per-test deterministic healing total mismatch"
);

assert.equal(
  testAIEvents,
  ai.totalEvaluations,
  "Per-test AI recovery total mismatch"
);

// --------------------------------------------------
// 6. Validation completed
// --------------------------------------------------

console.log(
  "[AutoHeal QA] Deterministic healing validation passed!"
);

console.log(
  "[AutoHeal QA] AI recovery reporting validation passed!"
);

console.log(
  `[AutoHeal QA] Healing events: ${report.healing.totalEvents}`
);

console.log(
  `[AutoHeal QA] AI evaluations: ${ai.totalEvaluations}`
);

console.log(
  `[AutoHeal QA] AI suggestions: ${ai.suggested}`
);

console.log(
  `[AutoHeal QA] AI failures: ${ai.failed}`
);

console.log(
  "[AutoHeal QA] Phase 3.7 report validation passed!"
);

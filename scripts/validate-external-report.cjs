
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const {
  validateReport,
} = require("./validate-healing-report.cjs");

const EXPECTED_IDS = Array.from(
  { length: 10 },
  (_, index) => `EXT-${String(index + 1).padStart(3, "0")}`
);

function validateExternalReport(report) {
  // Reuse the existing framework's structural and
  // healing/AI analytics validation.
  validateReport(report);

  assert.equal(report.framework, "AutoHeal QA");

  assert.equal(report.totalAttempts, 10);
  assert.equal(report.passedAttempts, 10);
  assert.equal(report.failedAttempts, 0);
  assert.equal(report.skippedAttempts, 0);
  assert.equal(report.timedOutAttempts, 0);
  assert.equal(report.interruptedAttempts, 0);

  assert.equal(report.tests.length, 10);

  const actualIds = [];

  for (const test of report.tests) {
    assert.equal(test.project, "chromium");
    assert.equal(test.status, "passed");

    assert.ok(
      Number.isFinite(test.durationMs) &&
        test.durationMs >= 0,
      "Invalid test duration"
    );

    assert.ok(
      Number.isSafeInteger(test.retry) &&
        test.retry >= 0,
      "Invalid retry count"
    );

    const matches = test.title.match(/\bEXT-\d{3}\b/g);

    assert.ok(
      matches && matches.length === 1,
      `Missing or ambiguous external test ID: ${test.title}`
    );

    actualIds.push(matches[0]);
  }

  assert.deepEqual(
    [...actualIds].sort(),
    EXPECTED_IDS,
    "External test coverage mismatch"
  );

  const testById = new Map(
    report.tests.map((test, index) => [
      actualIds[index],
      test,
    ])
  );

  const healingCount = report.tests.reduce(
    (total, test) => total + test.healingEvents.length,
    0
  );

  const aiCount = report.tests.reduce(
    (total, test) => total + test.aiRecoveryEvents.length,
    0
  );

  assert.equal(healingCount, report.healing.totalEvents);
  assert.equal(aiCount, report.aiRecovery.totalEvaluations);

  // These scenarios intentionally exercise the
  // trusted deterministic recovery path.
  for (const id of ["EXT-006", "EXT-010"]) {
    assert.ok(
      testById.get(id).healingEvents.length >= 1,
      `${id} must record a healing event`
    );
  }

  // AI suggestions must remain advisory.
  const advisoryTest = testById.get("EXT-009");

  assert.ok(
    advisoryTest.aiRecoveryEvents.some(
      (event) => event.status === "SUGGESTED"
    ),
    "EXT-009 must record an AI suggestion"
  );

  assert.equal(
    advisoryTest.healingEvents.length,
    0,
    "EXT-009 must not record automatic locator healing"
  );

  return {
    tests: report.tests.length,
    healingEvents: healingCount,
    aiEvaluations: aiCount,
    retries: report.tests.reduce(
      (total, test) => total + test.retry,
      0
    ),
  };
}

function main() {
  const reportPath = path.resolve(
    process.argv[2] || "reports/autoheal/summary.json"
  );

  assert.ok(
    fs.existsSync(reportPath),
    `External report not found: ${reportPath}`
  );

  const report = JSON.parse(
    fs.readFileSync(reportPath, "utf8")
  );

  const result = validateExternalReport(report);

  console.log("[AutoHeal QA] External report validation passed");
  console.log(`Tests: ${result.tests}/10`);
  console.log(`Healing events: ${result.healingEvents}`);
  console.log(`AI evaluations: ${result.aiEvaluations}`);
  console.log(`Retries: ${result.retries}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(
      `[AutoHeal QA] External report validation failed: ${error.message}`
    );
    process.exitCode = 1;
  }
}

module.exports = { validateExternalReport };

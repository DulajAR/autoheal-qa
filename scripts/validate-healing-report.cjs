
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

assert.equal(
  report.overallStatus,
  "passed",
  "Test execution must pass"
);

assert.equal(
  report.healing.totalEvents,
  9,
  "Expected nine healing events"
);

assert.equal(
  report.healing.healedAttempts,
  9,
  "Expected nine healed attempts"
);

assert.equal(
  report.healing.averageConfidence,
  0.95,
  "Unexpected average confidence"
);

assert.equal(
  report.healing.events.length,
  report.healing.totalEvents,
  "Healing event count mismatch"
);

for (const event of report.healing.events) {
  assert.equal(event.event, "LOCATOR_HEALED");
  assert.ok(event.primarySelector);
  assert.ok(event.recoveredSelector);
  assert.ok(event.strategy);
  assert.ok(event.confidence >= 0.85);
  assert.ok(event.confidence <= 1);
}

console.log(
  "[AutoHeal QA] Healing audit validation passed!"
);


"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const summaryFile = path.resolve(
  process.argv[2] || "reports/autoheal/summary.json"
);

const historyFile = path.resolve(
  process.argv[3] || "reports/autoheal/history.json"
);

const MAX_RUNS = 100;

const VALID_STATUSES = new Set([
  "passed",
  "failed",
  "skipped",
  "timedOut",
  "interrupted",
]);

function fail(message) {
  console.error(`[AutoHeal QA] ${message}`);
  process.exit(1);
}

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function validDate(value) {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value))
  );
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validateSummary(summary) {
  if (
    !summary ||
    typeof summary !== "object" ||
    Array.isArray(summary)
  ) {
    fail("Invalid summary: expected an object.");
  }

  if (summary.framework !== "AutoHeal QA") {
    fail("Invalid summary: framework mismatch.");
  }

  if (
    !validDate(summary.startedAt) ||
    !validDate(summary.finishedAt)
  ) {
    fail("Invalid summary: timestamps are missing or invalid.");
  }

  if (
    Date.parse(summary.finishedAt) <
    Date.parse(summary.startedAt)
  ) {
    fail("Invalid summary: finish time precedes start time.");
  }

  if (
    !Array.isArray(summary.tests) ||
    summary.tests.length === 0
  ) {
    fail(
      "Invalid summary: no test attempts recorded. " +
      "Historical analytics will not be modified."
    );
  }

  const counters = [
    "totalAttempts",
    "passedAttempts",
    "failedAttempts",
    "skippedAttempts",
    "timedOutAttempts",
    "interruptedAttempts",
  ];

  for (const counter of counters) {
    if (!nonNegativeInteger(summary[counter])) {
      fail(`Invalid summary counter: ${counter}`);
    }
  }

  if (summary.totalAttempts !== summary.tests.length) {
    fail("Invalid summary: totalAttempts mismatch.");
  }

  const counts = {
    passed: 0,
    failed: 0,
    skipped: 0,
    timedOut: 0,
    interrupted: 0,
  };

  for (const test of summary.tests) {
    if (
      !test ||
      typeof test !== "object" ||
      Array.isArray(test)
    ) {
      fail("Invalid summary: malformed test record.");
    }

    if (
      typeof test.title !== "string" ||
      test.title.length === 0 ||
      typeof test.project !== "string" ||
      test.project.length === 0 ||
      !VALID_STATUSES.has(test.status) ||
      !nonNegativeInteger(test.retry) ||
      typeof test.durationMs !== "number" ||
      !Number.isFinite(test.durationMs) ||
      test.durationMs < 0 ||
      !Array.isArray(test.healingEvents)
    ) {
      fail("Invalid summary: malformed test record fields.");
    }

    counts[test.status]++;

    for (const event of test.healingEvents) {
      if (
        !event ||
        event.event !== "LOCATOR_HEALED" ||
        typeof event.primarySelector !== "string" ||
        typeof event.recoveredSelector !== "string" ||
        typeof event.strategy !== "string" ||
        typeof event.confidence !== "number" ||
        !Number.isFinite(event.confidence) ||
        event.confidence < 0 ||
        event.confidence > 1
      ) {
        fail("Invalid summary: malformed healing event.");
      }
    }
  }

  const mappings = {
    passedAttempts: "passed",
    failedAttempts: "failed",
    skippedAttempts: "skipped",
    timedOutAttempts: "timedOut",
    interruptedAttempts: "interrupted",
  };

  for (const [counter, status] of Object.entries(mappings)) {
    if (summary[counter] !== counts[status]) {
      fail(`Invalid summary: ${counter} mismatch.`);
    }
  }

  if (
    !summary.healing ||
    typeof summary.healing !== "object" ||
    !Array.isArray(summary.healing.events)
  ) {
    fail("Invalid summary: healing statistics missing.");
  }

  const allEvents = summary.tests.flatMap(
    test => test.healingEvents
  );

  const healedAttempts = summary.tests.filter(
    test => test.healingEvents.length > 0
  ).length;

  if (
    summary.healing.totalEvents !== allEvents.length ||
    summary.healing.healedAttempts !== healedAttempts ||
    summary.healing.events.length !== allEvents.length
  ) {
    fail("Invalid summary: healing statistics mismatch.");
  }

  if (
    allEvents.length === 0 &&
    summary.healing.averageConfidence !== null
  ) {
    fail("Invalid summary: unexpected healing confidence.");
  }

  if (allEvents.length > 0) {
    const average = Number(
      (
        allEvents.reduce(
          (sum, event) => sum + event.confidence,
          0
        ) / allEvents.length
      ).toFixed(3)
    );

    if (summary.healing.averageConfidence !== average) {
      fail("Invalid summary: average confidence mismatch.");
    }
  }
}

if (!fs.existsSync(summaryFile)) {
  fail(`Summary not found: ${summaryFile}`);
}

let summary;
let history;

try {
  summary = readJSON(summaryFile);
} catch (error) {
  fail(`Cannot read summary: ${error.message}`);
}

validateSummary(summary);

if (fs.existsSync(historyFile)) {
  try {
    history = readJSON(historyFile);
  } catch (error) {
    fail(`Cannot read existing history: ${error.message}`);
  }

  if (
    !history ||
    history.schemaVersion !== 1 ||
    !Array.isArray(history.runs)
  ) {
    fail("Unsupported history format.");
  }
} else {
  history = {
    schemaVersion: 1,
    runs: [],
  };
}

const tests = summary.tests.map(test => ({
  title: test.title,
  project: test.project,
  status: test.status,
  retry: test.retry,
  healingCount: test.healingEvents.length,
}));

const selectorCounts = {};

for (const test of summary.tests) {
  for (const event of test.healingEvents) {
    const key = event.primarySelector;

    selectorCounts[key] =
      (selectorCounts[key] || 0) + 1;
  }
}

const run = {
  id: crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        startedAt: summary.startedAt,
        finishedAt: summary.finishedAt,
        tests,
      })
    )
    .digest("hex")
    .slice(0, 20),

  startedAt: summary.startedAt,
  finishedAt: summary.finishedAt,
  overallStatus: String(
    summary.overallStatus || "unknown"
  ),
  totalAttempts: tests.length,

  passedAttempts: tests.filter(
    test => test.status === "passed"
  ).length,

  failedAttempts: tests.filter(
    test =>
      ["failed", "timedOut", "interrupted"].includes(
        test.status
      )
  ).length,

  healingEvents: tests.reduce(
    (sum, test) => sum + test.healingCount,
    0
  ),

  selectorCounts,
  tests,
};

const previousCount = history.runs.length;

history.runs = [
  ...history.runs.filter(
    existing => existing.id !== run.id
  ),
  run,
]
  .sort(
    (a, b) =>
      Date.parse(a.startedAt) -
      Date.parse(b.startedAt)
  )
  .slice(-MAX_RUNS);

fs.mkdirSync(path.dirname(historyFile), {
  recursive: true,
});

const tempFile = `${historyFile}.${process.pid}.tmp`;

try {
  fs.writeFileSync(
    tempFile,
    JSON.stringify(history, null, 2) + "\n",
    "utf8"
  );

  fs.renameSync(tempFile, historyFile);
} finally {
  if (fs.existsSync(tempFile)) {
    fs.rmSync(tempFile, { force: true });
  }
}

console.log(
  `[AutoHeal QA] History saved: ${historyFile}`
);

console.log(
  `[AutoHeal QA] ${history.runs.length} run(s) retained ` +
  `(previously ${previousCount}), ` +
  `latest: ${run.passedAttempts}/${run.totalAttempts} passed`
);

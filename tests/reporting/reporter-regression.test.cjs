
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

const sourcePath = path.resolve(
  __dirname,
  "../../src/reporters/AutoHealReporter.ts"
);

// --------------------------------------------------
// 1. Load TypeScript reporter using Node.js 24
// --------------------------------------------------

function loadReporter() {
  const source = fs.readFileSync(sourcePath, "utf8");

  // Node.js 24 supports stripping TypeScript types.
  // This avoids the TypeScript 7 compiler API.
  let compiled = Module.stripTypeScriptTypes(source, {
    mode: "transform",
    sourceUrl: sourcePath,
  });

  // Convert the two runtime imports to CommonJS.
  // Type-only imports are removed by type stripping.
  compiled = compiled
    .replace(
      /import fs from ["']node:fs["'];?/g,
      'const fs = require("node:fs");'
    )
    .replace(
      /import path from ["']node:path["'];?/g,
      'const path = require("node:path");'
    )
    .replace(
      /export default AutoHealReporter;?/g,
      "module.exports = AutoHealReporter;"
    );

  const loaded = new Module(sourcePath, module);

  loaded.filename = sourcePath;

  loaded.paths = Module._nodeModulePaths(
    path.dirname(sourcePath)
  );

  loaded._compile(compiled, sourcePath);

  return loaded.exports;
}

const Reporter = loadReporter();

// --------------------------------------------------
// 2. Test fixture factories
// --------------------------------------------------

function createAIEvent(overrides = {}) {
  return {
    event: "AI_RECOVERY_EVALUATED",
    timestamp: "2026-11-05T07:00:00Z",
    status: "SUGGESTED",
    provider: "mock",
    evaluatedCandidates: 1,
    confidence: 0.95,
    ...overrides,
  };
}

function createHealingEvent(overrides = {}) {
  return {
    event: "LOCATOR_HEALED",
    timestamp: "2026-11-05T07:00:00Z",
    primarySelector: "#old",
    recoveredSelector: "#new",
    strategy: "fallback",
    confidence: 0.95,
    ...overrides,
  };
}

function createAttachment(name, value) {
  return {
    name,
    contentType: "application/json",
    body: Buffer.from(JSON.stringify(value)),
  };
}

function createTest(project, title) {
  return {
    titlePath: () => [project, title],
    parent: {
      project: () => ({
        name: project,
      }),
    },
  };
}

function createResult(attachments = []) {
  return {
    status: "passed",
    duration: 25,
    retry: 0,
    attachments,
  };
}

// --------------------------------------------------
// 3. Isolated report execution
// --------------------------------------------------

function withTemporaryReport(callback) {
  const originalDirectory = process.cwd();

  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "autoheal-reporter-")
  );

  try {
    process.chdir(temporaryDirectory);

    const reporter = new Reporter();

    reporter.onBegin();

    return callback(reporter);
  } finally {
    process.chdir(originalDirectory);

    fs.rmSync(temporaryDirectory, {
      recursive: true,
      force: true,
    });
  }
}

function executeReporter(callback) {
  return withTemporaryReport(reporter => {
    callback(reporter);

    reporter.onEnd({
      status: "passed",
    });

    const reportPath = path.resolve(
      "reports",
      "autoheal",
      "summary.json"
    );

    assert.ok(
      fs.existsSync(reportPath),
      "Reporter did not create summary.json"
    );

    return JSON.parse(
      fs.readFileSync(reportPath, "utf8")
    );
  });
}

// --------------------------------------------------
// REP-001: Cross-browser aggregation
// --------------------------------------------------

test(
  "REP-001: aggregates multiple browser projects",
  () => {
    const report = executeReporter(reporter => {
      for (const project of [
        "chromium",
        "firefox",
        "webkit",
      ]) {
        reporter.onTestEnd(
          createTest(project, "healing"),
          createResult([
            createAttachment(
              "autoheal-healing-event",
              createHealingEvent()
            ),
            createAttachment(
              "autoheal-ai-recovery-event",
              createAIEvent()
            ),
          ])
        );
      }
    });

    assert.equal(report.totalAttempts, 3);

    assert.equal(
      report.healing.totalEvents,
      3
    );

    assert.equal(
      report.healing.healedAttempts,
      3
    );

    assert.equal(
      report.aiRecovery.totalEvaluations,
      3
    );

    assert.equal(
      report.aiRecovery.suggested,
      3
    );

    assert.deepEqual(
      report.tests.map(record => record.project),
      ["chromium", "firefox", "webkit"]
    );
  }
);

// --------------------------------------------------
// REP-002: AI audit privacy
// --------------------------------------------------

test(
  "REP-002: excludes unexpected AI fields",
  () => {
    const report = executeReporter(reporter => {
      reporter.onTestEnd(
        createTest("chromium", "privacy"),
        createResult([
          createAttachment(
            "autoheal-ai-recovery-event",
            createAIEvent({
              rawDOM: "<secret>",
              suggestedSelector: "#private",
              unexpectedField: "sensitive",
            })
          ),
        ])
      );
    });

    const event = report.aiRecovery.events[0];

    assert.equal(
      Object.hasOwn(event, "rawDOM"),
      false
    );

    assert.equal(
      Object.hasOwn(event, "suggestedSelector"),
      false
    );

    assert.equal(
      Object.hasOwn(event, "unexpectedField"),
      false
    );

    assert.equal(
      report.aiRecovery.totalEvaluations,
      1
    );
  }
);

// --------------------------------------------------
// REP-003: Malformed JSON handling
// --------------------------------------------------

test(
  "REP-003: ignores malformed JSON",
  () => {
    const report = executeReporter(reporter => {
      reporter.onTestEnd(
        createTest("firefox", "malformed"),
        createResult([
          {
            name: "autoheal-ai-recovery-event",
            contentType: "application/json",
            body: Buffer.from("{invalid-json"),
          },
        ])
      );
    });

    assert.equal(report.totalAttempts, 1);

    assert.equal(
      report.aiRecovery.totalEvaluations,
      0
    );
  }
);

// --------------------------------------------------
// REP-004: Timestamp validation
// --------------------------------------------------

test(
  "REP-004: rejects invalid AI timestamp",
  () => {
    const report = executeReporter(reporter => {
      reporter.onTestEnd(
        createTest("chromium", "timestamp"),
        createResult([
          createAttachment(
            "autoheal-ai-recovery-event",
            createAIEvent({
              timestamp: "not-a-date",
            })
          ),
        ])
      );
    });

    assert.equal(
      report.aiRecovery.totalEvaluations,
      0
    );
  }
);

// --------------------------------------------------
// REP-005: Deterministic confidence validation
// --------------------------------------------------

test(
  "REP-005: rejects low healing confidence",
  () => {
    const report = executeReporter(reporter => {
      reporter.onTestEnd(
        createTest("webkit", "confidence"),
        createResult([
          createAttachment(
            "autoheal-healing-event",
            createHealingEvent({
              confidence: 0.4,
            })
          ),
        ])
      );
    });

    assert.equal(
      report.healing.totalEvents,
      0
    );

    assert.equal(
      report.healing.healedAttempts,
      0
    );
  }
);

// --------------------------------------------------
// REP-006: Multiple events per attempt
// --------------------------------------------------

test(
  "REP-006: counts multiple events in one attempt",
  () => {
    const report = executeReporter(reporter => {
      reporter.onTestEnd(
        createTest("chromium", "multiple events"),
        createResult([
          createAttachment(
            "autoheal-healing-event",
            createHealingEvent()
          ),
          createAttachment(
            "autoheal-healing-event",
            createHealingEvent()
          ),
        ])
      );
    });

    assert.equal(
      report.healing.totalEvents,
      2
    );

    assert.equal(
      report.healing.healedAttempts,
      1
    );
  }
);

// --------------------------------------------------
// REP-007: AI status aggregation
// --------------------------------------------------

test(
  "REP-007: aggregates AI recovery statuses",
  () => {
    const report = executeReporter(reporter => {
      for (const status of [
        "SUGGESTED",
        "FAILED",
        "DISABLED",
        "NO_CANDIDATE",
      ]) {
        reporter.onTestEnd(
          createTest("chromium", status),
          createResult([
            createAttachment(
              "autoheal-ai-recovery-event",
              createAIEvent({
                status,
                evaluatedCandidates: 1,
              })
            ),
          ])
        );
      }
    });

    const ai = report.aiRecovery;

    assert.equal(ai.totalEvaluations, 4);
    assert.equal(ai.suggested, 1);
    assert.equal(ai.failed, 1);
    assert.equal(ai.disabled, 1);
    assert.equal(ai.noCandidate, 1);
    assert.equal(ai.evaluatedCandidates, 4);
    assert.equal(ai.averageConfidence, 0.95);
  }
);

// --------------------------------------------------
// REP-008: Preserve existing reports
// --------------------------------------------------

test(
  "REP-008: preserves report without attempts",
  () => {
    withTemporaryReport(reporter => {
      const output = path.resolve(
        "reports",
        "autoheal",
        "summary.json"
      );

      fs.mkdirSync(path.dirname(output), {
        recursive: true,
      });

      fs.writeFileSync(
        output,
        '{"preserved":true}',
        "utf8"
      );

      reporter.onEnd({
        status: "passed",
      });

      assert.deepEqual(
        JSON.parse(
          fs.readFileSync(output, "utf8")
        ),
        {
          preserved: true,
        }
      );
    });
  }
);

// --------------------------------------------------
// REP-009: Ignore unrelated attachments
// --------------------------------------------------

test(
  "REP-009: ignores unrelated attachments",
  () => {
    const report = executeReporter(reporter => {
      reporter.onTestEnd(
        createTest("firefox", "unrelated"),
        createResult([
          createAttachment(
            "other-attachment",
            createAIEvent()
          ),
        ])
      );
    });

    assert.equal(
      report.healing.totalEvents,
      0
    );

    assert.equal(
      report.aiRecovery.totalEvaluations,
      0
    );
  }
);

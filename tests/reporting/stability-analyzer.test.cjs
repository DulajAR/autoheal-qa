"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { analyze } = require("../../scripts/analyze-stability.cjs");

const attempt = (title, status, retry = 0, durationMs = 100, project = "chromium") => ({
  title, status, retry, durationMs, project, healingCount: 0
});
const run = (id, tests) => ({ id, tests });
const history = (...runs) => ({ schemaVersion: 1, runs });
const byTitle = (result, title) => result.tests.find(t => t.title === title);

test("STA-001: consistently passing tests are stable", () => {
  const result = analyze(history(run("r1", [attempt("A", "passed")]), run("r2", [attempt("A", "passed")])));
  assert.equal(result.flakyTestCount, 0);
  assert.equal(byTitle(result, "A").classification, "passing");
  assert.equal(byTitle(result, "A").finalPassRatePercent, 100);
});

test("STA-002: mixed final outcomes are cross-run flaky", () => {
  const result = analyze(history(run("r1", [attempt("A", "failed")]), run("r2", [attempt("A", "passed")])));
  assert.equal(byTitle(result, "A").classification, "flaky");
  assert.equal(byTitle(result, "A").crossRunFlaky, true);
  assert.equal(byTitle(result, "A").finalPassRatePercent, 50);
});

test("STA-003: failure followed by retry pass is flaky", () => {
  const result = analyze(history(run("r1", [attempt("A", "failed", 0, 80), attempt("A", "passed", 1, 120)])));
  const a = byTitle(result, "A");
  assert.equal(a.retryFlaky, true);
  assert.equal(a.passedRuns, 1);
  assert.equal(a.failedRuns, 0);
  assert.equal(a.totalAttempts, 2);
  assert.equal(a.duration.averageMs, 200);
});

test("STA-004: consistently failing tests are failing", () => {
  const result = analyze(history(run("r1", [attempt("A", "timedOut")]), run("r2", [attempt("A", "failed")])));
  assert.equal(byTitle(result, "A").classification, "failing");
  assert.equal(result.failingTestCount, 1);
});

test("STA-005: skipped tests are excluded from pass rate", () => {
  const result = analyze(history(run("r1", [attempt("A", "skipped")]), run("r2", [attempt("A", "passed")])));
  assert.equal(byTitle(result, "A").finalPassRatePercent, 100);
  assert.equal(byTitle(result, "A").skippedRuns, 1);
});

test("STA-006: absent tests count as missing runs", () => {
  const result = analyze(history(run("r1", [attempt("A", "passed")]), run("r2", [attempt("B", "passed")])));
  assert.equal(byTitle(result, "A").missingRuns, 1);
  assert.equal(result.testsWithMissingRuns, 2);
});

test("STA-007: legacy history without durations is supported", () => {
  const old = attempt("A", "passed");
  delete old.durationMs;
  const result = analyze(history(run("r1", [old])));
  assert.equal(byTitle(result, "A").duration.averageMs, null);
});

test("STA-008: duration statistics are calculated", () => {
  const result = analyze(history(run("r1", [attempt("A", "passed", 0, 100)]), run("r2", [attempt("A", "passed", 0, 300)])));
  const d = byTitle(result, "A").duration;
  assert.equal(d.averageMs, 200);
  assert.equal(d.minimumMs, 100);
  assert.equal(d.maximumMs, 300);
  assert.equal(d.standardDeviationMs, 100);
});

test("STA-009: duplicate retry indices are rejected", () => {
  assert.throws(() => analyze(history(run("r1", [attempt("A", "failed", 0), attempt("A", "passed", 0)]))), /Duplicate retry/);
});

test("STA-010: malformed history and duplicate runs are rejected", () => {
  assert.throws(() => analyze({ schemaVersion: 2, runs: [] }), /Unsupported history/);
  assert.throws(() => analyze(history(run("r1", []), run("r1", []))), /Duplicate history run/);
});

test("STA-011: browser projects remain separate", () => {
  const result = analyze(history(run("r1", [attempt("A", "passed", 0, 100, "chromium"), attempt("A", "failed", 0, 100, "firefox")])));
  assert.equal(result.testCount, 2);
  assert.equal(result.flakyTestCount, 0);
});

test("STA-012: partial duration coverage is not treated as complete", () => {
  const second = attempt("A", "passed", 1, 100);
  delete second.durationMs;
  const result = analyze(history(run("r1", [attempt("A", "failed", 0, 50), second])));
  assert.equal(byTitle(result, "A").duration.measuredRuns, 0);
});


test("COV-001: distinguishes absent project from missing test within project", () => {
  const result = analyze(history(
    run("r1", [attempt("A", "passed", 0, 100, "chromium"), attempt("F", "passed", 0, 100, "firefox")]),
    run("r2", [attempt("A", "passed", 0, 100, "chromium")])
  ));
  const firefox = result.tests.find(t => t.project === "firefox");
  assert.equal(firefox.missingRuns, 1);
  assert.equal(firefox.missingProjectRuns, 0);
  assert.equal(firefox.observedCoveragePercent, 100);
});

test("COV-002: identifies missing tests within an observed project", () => {
  const result = analyze(history(
    run("r1", [attempt("A", "passed"), attempt("B", "passed")]),
    run("r2", [attempt("A", "passed")])
  ));
  assert.equal(byTitle(result, "B").missingProjectRuns, 1);
  assert.equal(byTitle(result, "B").observedCoveragePercent, 50);
  assert.equal(result.coverage.testsMissingFromProjectRuns, 1);
});

test("COV-003: identical observed suites share comparison group", () => {
  const result = analyze(history(
    run("r1", [attempt("A", "passed"), attempt("B", "passed")]),
    run("r2", [attempt("B", "passed"), attempt("A", "passed")]),
    run("r3", [attempt("A", "passed")])
  ));
  assert.deepEqual(result.coverage.comparableGroups.map(g => g.runCount), [2, 1]);
  assert.equal(result.coverage.byProject[0].testsPresentInEveryProjectRun, 1);
});

test("COV-004: retry attempts do not inflate observed suite size", () => {
  const result = analyze(history(run("r1", [attempt("A", "failed"), attempt("A", "passed", 1)])));
  assert.equal(result.coverage.comparableGroups[0].testCount, 1);
  assert.equal(result.tests[0].totalAttempts, 2);
});

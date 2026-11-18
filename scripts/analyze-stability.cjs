"use strict";

const fs = require("node:fs");
const path = require("node:path");

const historyFile = path.resolve(process.argv[2] || "reports/autoheal/history.json");
const outputFile = path.resolve(process.argv[3] || "reports/autoheal/stability.json");
const STATUSES = new Set(["passed", "failed", "skipped", "timedOut", "interrupted"]);
const FAILED = new Set(["failed", "timedOut", "interrupted"]);

function check(condition, message) {
  if (!condition) throw new Error(message);
}
function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function duration(value) { return typeof value === "number" && Number.isFinite(value) && value >= 0; }
function percent(n, d) { return d ? Number((100 * n / d).toFixed(2)) : null; }
function rounded(n) { return Number(n.toFixed(3)); }

function analyze(history) {
  check(object(history) && history.schemaVersion === 1 && Array.isArray(history.runs), "Unsupported history format.");
  const seenRuns = new Set();
  const stats = new Map();
  const projectRuns = new Map();
  const comparableGroups = new Map();

  for (const run of history.runs) {
    check(object(run) && typeof run.id === "string" && run.id.length > 0 && Array.isArray(run.tests), "Invalid history run.");
    check(!seenRuns.has(run.id), "Duplicate history run ID.");
    seenRuns.add(run.id);
    const grouped = new Map();

    for (const attempt of run.tests) {
      check(object(attempt) && typeof attempt.project === "string" && attempt.project.length > 0 && typeof attempt.title === "string" && attempt.title.length > 0 && STATUSES.has(attempt.status) && Number.isSafeInteger(attempt.retry) && attempt.retry >= 0, "Invalid history test attempt.");
      if (attempt.durationMs !== undefined) check(duration(attempt.durationMs), "Invalid history test duration.");
      const key = JSON.stringify([attempt.project, attempt.title]);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(attempt);
    }

    // A project is considered present only if it has recorded attempts.
    // Suite fingerprints describe observed logical tests, not intended selection.
    const suites = new Map();
    for (const key of grouped.keys()) {
      const [project] = JSON.parse(key);
      if (!suites.has(project)) suites.set(project, []);
      suites.get(project).push(key);
    }
    for (const [project, keys] of suites) {
      projectRuns.set(project, (projectRuns.get(project) || 0) + 1);
      const fingerprint = JSON.stringify(keys.sort());
      const groupKey = JSON.stringify([project, fingerprint]);
      if (!comparableGroups.has(groupKey)) comparableGroups.set(groupKey, { project, fingerprint, runIds: [], keys });
      comparableGroups.get(groupKey).runIds.push(run.id);
    }

    for (const [key, attempts] of grouped) {
      const retries = new Set();
      for (const attempt of attempts) {
        check(!retries.has(attempt.retry), "Duplicate retry index for logical test.");
        retries.add(attempt.retry);
      }
      const ordered = [...attempts].sort((a, b) => a.retry - b.retry);
      const final = ordered[ordered.length - 1];
      const recovered = final.status === "passed" && ordered.slice(0, -1).some(a => FAILED.has(a.status));
      const measured = ordered.filter(a => duration(a.durationMs));
      // Duration measures total execution effort including retries. Older runs without
      // any durations remain valid, but partial measurements are not treated as complete.
      const totalDuration = measured.length === ordered.length
        ? measured.reduce((sum, a) => sum + a.durationMs, 0)
        : null;

      if (!stats.has(key)) {
        const [project, title] = JSON.parse(key);
        stats.set(key, {
          project, title, observedRuns: 0, passedRuns: 0, failedRuns: 0,
          skippedRuns: 0, retryRecoveredRuns: 0, totalAttempts: 0,
          durations: [], runIds: []
        });
      }
      const item = stats.get(key);
      item.observedRuns++;
      item.runIds.push(run.id);
      item.totalAttempts += ordered.length;
      if (final.status === "passed") item.passedRuns++;
      else if (final.status === "skipped") item.skippedRuns++;
      else item.failedRuns++;
      if (recovered) item.retryRecoveredRuns++;
      if (totalDuration !== null) item.durations.push(totalDuration);
    }
  }

  const tests = [...stats.values()].map(item => {
    const { durations, runIds, ...counts } = item;
    const measuredRuns = durations.length;
    const mean = measuredRuns ? durations.reduce((a, b) => a + b, 0) / measuredRuns : null;
    const variance = measuredRuns ? durations.reduce((sum, n) => sum + (n - mean) ** 2, 0) / measuredRuns : null;
    const crossRunFlaky = item.passedRuns > 0 && item.failedRuns > 0;
    const retryFlaky = item.retryRecoveredRuns > 0;
    const classification = crossRunFlaky || retryFlaky ? "flaky"
      : item.failedRuns > 0 ? "failing"
      : item.passedRuns > 0 ? "passing" : "skipped";
    return {
      ...counts,
      missingRuns: history.runs.length - item.observedRuns,
      projectRunCount: projectRuns.get(item.project),
      missingProjectRuns: projectRuns.get(item.project) - item.observedRuns,
      observedCoveragePercent: percent(item.observedRuns, projectRuns.get(item.project)),
      finalPassRatePercent: percent(item.passedRuns, item.passedRuns + item.failedRuns),
      classification, crossRunFlaky, retryFlaky,
      duration: {
        measuredRuns,
        averageMs: mean === null ? null : rounded(mean),
        minimumMs: measuredRuns ? rounded(Math.min(...durations)) : null,
        maximumMs: measuredRuns ? rounded(Math.max(...durations)) : null,
        standardDeviationMs: variance === null ? null : rounded(Math.sqrt(variance))
      }
    };
  }).sort((a, b) => a.project.localeCompare(b.project) || a.title.localeCompare(b.title));

  const coverageByProject = [...projectRuns].map(([project, runCount]) => {
    const projectTests = tests.filter(t => t.project === project);
    return {
      project, runCount, testCount: projectTests.length,
      testsPresentInEveryProjectRun: projectTests.filter(t => t.missingProjectRuns === 0).length,
      testsMissingFromProjectRuns: projectTests.filter(t => t.missingProjectRuns > 0).length
    };
  }).sort((a, b) => a.project.localeCompare(b.project));

  const comparisonGroups = [...comparableGroups.values()].map(group => ({
    project: group.project,
    runCount: group.runIds.length,
    testCount: group.keys.length,
    runIds: group.runIds
  })).sort((a, b) => a.project.localeCompare(b.project) || b.runCount - a.runCount || b.testCount - a.testCount);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runCount: history.runs.length,
    testCount: tests.length,
    flakyTestCount: tests.filter(t => t.classification === "flaky").length,
    failingTestCount: tests.filter(t => t.classification === "failing").length,
    testsWithMissingRuns: tests.filter(t => t.missingRuns > 0).length,
    coverage: {
      definition: "Observed tests only; history does not record intended test selection.",
      testsMissingFromProjectRuns: tests.filter(t => t.missingProjectRuns > 0).length,
      byProject: coverageByProject,
      comparableGroups: comparisonGroups
    },
    tests
  };
}

function main() {
  check(fs.existsSync(historyFile), `History not found: ${historyFile}`);
  const history = JSON.parse(fs.readFileSync(historyFile, "utf8"));
  const result = analyze(history);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  const temp = `${outputFile}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(result, null, 2) + "\n", "utf8");
    fs.renameSync(temp, outputFile);
  } finally {
    if (fs.existsSync(temp)) fs.rmSync(temp, { force: true });
  }
  console.log(`[AutoHeal QA] Stability report saved: ${outputFile}`);
  console.log(`[AutoHeal QA] ${result.runCount} runs, ${result.testCount} tests, ${result.flakyTestCount} flaky, ${result.failingTestCount} failing`);
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    console.error(`[AutoHeal QA] ${error.message}`);
    process.exitCode = 1;
  }
}
module.exports = { analyze };

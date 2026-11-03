'use strict';
const fs = require('node:fs');
const path = require('node:path');
const historyFile = path.resolve(process.argv[2] || 'reports/autoheal/history.json');
const outputFile = path.resolve(process.argv[3] || 'reports/autoheal/reliability.json');
function fail(message) { console.error(`[AutoHeal QA] ${message}`); process.exit(1); }
if (!fs.existsSync(historyFile)) fail(`History not found: ${historyFile}`);
let history;
try { history = JSON.parse(fs.readFileSync(historyFile, 'utf8')); } catch (e) { fail(`Invalid history JSON: ${e.message}`); }
if (history?.schemaVersion !== 1 || !Array.isArray(history.runs)) fail('Unsupported history format.');
const runs = history.runs;
const totalAttempts = runs.reduce((n, r) => n + r.totalAttempts, 0);
const passedAttempts = runs.reduce((n, r) => n + r.passedAttempts, 0);
const selectorCounts = {};
const browserStats = new Map();
const testStats = new Map();
for (const run of runs) {
  for (const [selector, count] of Object.entries(run.selectorCounts || {})) selectorCounts[selector] = (selectorCounts[selector] || 0) + count;
  for (const test of run.tests || []) {
    const browser = String(test.project || 'unknown');
    const key = `${browser}\u0000${test.title}`;
    const b = browserStats.get(browser) || {project: browser, totalAttempts: 0, passedAttempts: 0};
    b.totalAttempts++;
    if (test.status === 'passed') b.passedAttempts++;
    browserStats.set(browser, b);
    const t = testStats.get(key) || {project: browser, title: test.title, totalAttempts: 0, passedAttempts: 0, failedAttempts: 0, retries: 0};
    t.totalAttempts++;
    if (test.status === 'passed') t.passedAttempts++;
    if (['failed', 'timedOut', 'interrupted'].includes(test.status)) t.failedAttempts++;
    if (test.retry > 0) t.retries++;
    testStats.set(key, t);
  }
}
const percent = (numerator, denominator) => denominator ? Number((100 * numerator / denominator).toFixed(2)) : null;
const reliability = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  runCount: runs.length,
  totalAttempts,
  passedAttempts,
  passRatePercent: percent(passedAttempts, totalAttempts),
  trend: runs.map(r => ({startedAt: r.startedAt, status: r.overallStatus, totalAttempts: r.totalAttempts, passedAttempts: r.passedAttempts, passRatePercent: percent(r.passedAttempts, r.totalAttempts), healingEvents: r.healingEvents})),
  browsers: [...browserStats.values()].map(b => ({...b, passRatePercent: percent(b.passedAttempts, b.totalAttempts)})).sort((a,b) => a.project.localeCompare(b.project)),
  recurringSelectors: Object.entries(selectorCounts).map(([selector, recoveries]) => ({selector, recoveries})).sort((a,b) => b.recoveries - a.recoveries),
  possibleFlakyTests: [...testStats.values()].filter(t => t.passedAttempts > 0 && t.failedAttempts > 0).map(t => ({...t, passRatePercent: percent(t.passedAttempts, t.totalAttempts)})),
  testsWithRetries: [...testStats.values()].filter(t => t.retries > 0)
};
fs.mkdirSync(path.dirname(outputFile), {recursive: true});
fs.writeFileSync(outputFile, JSON.stringify(reliability, null, 2) + '\n', 'utf8');
console.log(`[AutoHeal QA] Reliability report generated: ${outputFile}`);
console.log(`[AutoHeal QA] ${reliability.runCount} run(s), pass rate: ${reliability.passRatePercent ?? 'N/A'}%, possible flaky tests: ${reliability.possibleFlakyTests.length}`);

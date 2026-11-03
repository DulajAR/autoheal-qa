'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const summaryFile = path.resolve(process.argv[2] || 'reports/autoheal/summary.json');
const historyFile = path.resolve(process.argv[3] || 'reports/autoheal/history.json');
const MAX_RUNS = 100;
function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function fail(message) { console.error(`[AutoHeal QA] ${message}`); process.exit(1); }
if (!fs.existsSync(summaryFile)) fail(`Summary not found: ${summaryFile}`);
let summary, history;
try { summary = readJSON(summaryFile); } catch (e) { fail(`Cannot read summary: ${e.message}`); }
if (!summary || !Array.isArray(summary.tests) || !Number.isFinite(Date.parse(summary.startedAt)) || !Number.isFinite(Date.parse(summary.finishedAt))) fail('Invalid summary structure.');
if (fs.existsSync(historyFile)) {
  try { history = readJSON(historyFile); } catch (e) { fail(`Cannot read existing history: ${e.message}`); }
  if (!history || history.schemaVersion !== 1 || !Array.isArray(history.runs)) fail('Unsupported history format.');
} else history = {schemaVersion: 1, runs: []};
const tests = summary.tests.map(t => ({
  title: String(t.title || ''), project: String(t.project || 'unknown'), status: String(t.status || 'unknown'),
  retry: Number(t.retry || 0), healingCount: Array.isArray(t.healingEvents) ? t.healingEvents.length : 0
}));
const selectorCounts = {};
for (const t of summary.tests) for (const event of Array.isArray(t.healingEvents) ? t.healingEvents : []) {
  const key = String(event.primarySelector || 'unknown');
  selectorCounts[key] = (selectorCounts[key] || 0) + 1;
}
const run = {
  id: crypto.createHash('sha256').update(JSON.stringify({startedAt: summary.startedAt, finishedAt: summary.finishedAt, tests})).digest('hex').slice(0, 20),
  startedAt: summary.startedAt, finishedAt: summary.finishedAt, overallStatus: String(summary.overallStatus || 'unknown'),
  totalAttempts: tests.length,
  passedAttempts: tests.filter(t => t.status === 'passed').length,
  failedAttempts: tests.filter(t => ['failed', 'timedOut', 'interrupted'].includes(t.status)).length,
  healingEvents: tests.reduce((sum, t) => sum + t.healingCount, 0),
  selectorCounts, tests
};
const previousCount = history.runs.length;
history.runs = [...history.runs.filter(r => r.id !== run.id), run]
  .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
  .slice(-MAX_RUNS);
fs.mkdirSync(path.dirname(historyFile), {recursive: true});
const tempFile = `${historyFile}.${process.pid}.tmp`;
fs.writeFileSync(tempFile, JSON.stringify(history, null, 2) + '\n', 'utf8');
fs.renameSync(tempFile, historyFile);
console.log(`[AutoHeal QA] History saved: ${historyFile}`);
console.log(`[AutoHeal QA] ${history.runs.length} run(s) retained (previously ${previousCount}), latest: ${run.passedAttempts}/${run.totalAttempts} passed`);

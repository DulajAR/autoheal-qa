'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const generator = path.resolve(
  __dirname,
  '../../scripts/generate-analytics.cjs'
);

function createFixture(t, report, reliability) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autoheal-reporting-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const summary = path.join(dir, 'summary.json');
  const output = path.join(dir, 'analytics.html');
  const history = path.join(dir, 'reliability.json');
  fs.writeFileSync(summary, JSON.stringify(report), 'utf8');
  if (reliability !== undefined) fs.writeFileSync(history, JSON.stringify(reliability), 'utf8');
  return { summary, output, history };
}
function generate(files) {
  return spawnSync(process.execPath, [generator, files.summary, files.output, files.history], { encoding: 'utf8', timeout: 15000 });
}
function emptyReport() {
  return {
    overallStatus: 'passed', totalAttempts: 0, passedAttempts: 0, tests: [],
    healing: { totalEvents: 0, healedAttempts: 0, averageConfidence: null },
    aiRecovery: { totalEvaluations: 0, suggested: 0, noCandidate: 0, disabled: 0, failed: 0, evaluatedCandidates: 0, averageConfidence: null, events: [] }
  };
}
function readEmbeddedData(html) {
  const match = html.match(/<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(match, 'Embedded report data is missing');
  return JSON.parse(match[1]);
}
function readResult(t, report, reliability) {
  const files = createFixture(t, report, reliability);
  const result = generate(files);
  assert.equal(result.status, 0, result.stderr);
  const html = fs.readFileSync(files.output, 'utf8');
  return { html, data: readEmbeddedData(html) };
}
function addAIEvent(report, overrides = {}) {
  const event = {
    event: 'AI_RECOVERY_EVALUATED', timestamp: '2026-11-05T07:00:00Z',
    status: 'SUGGESTED', provider: 'mock', evaluatedCandidates: 3, confidence: 0.95,
    analytics: {
      acceptedCandidates: 1, rejectedCandidates: 1, notEvaluatedCandidates: 1,
      validationDurationMs: 120, rejectionReasons: { NO_MATCH: 1 }
    }, ...overrides
  };
  report.tests.push({ title: 'AI suggestion test', project: 'chromium', status: 'passed', healingEvents: [], aiRecoveryEvents: [event] });
  report.totalAttempts = report.tests.length;
  report.passedAttempts = report.tests.length;
  delete report.aiRecovery;
  return event;
}

test('RPT-001: generates analytics for an empty report', t => {
  const { data } = readResult(t, emptyReport());
  assert.equal(data.total, 0);
  assert.equal(data.aiRecovery.totalEvaluations, 0);
  assert.deepEqual(data.aiEvents, []);
});
test('RPT-002: aggregates AI events by browser', t => {
  const report = emptyReport();
  addAIEvent(report, { evaluatedCandidates: 1, analytics: undefined });
  report.tests.push({ title: 'Provider failure test', project: 'firefox', status: 'passed', healingEvents: [], aiRecoveryEvents: [{ event: 'AI_RECOVERY_EVALUATED', timestamp: '2026-11-05T07:01:00Z', status: 'FAILED', provider: 'mock', evaluatedCandidates: 0, reason: 'RECOVERY_PIPELINE_FAILED' }] });
  report.totalAttempts = 2; report.passedAttempts = 2;
  const { data } = readResult(t, report);
  assert.equal(data.aiRecovery.totalEvaluations, 2);
  assert.equal(data.aiRecovery.suggested, 1);
  assert.equal(data.aiRecovery.failed, 1);
  assert.equal(data.aiRecovery.evaluatedCandidates, 1);
  assert.equal(data.aiEvents.length, 2);
  assert.deepEqual(data.aiEvents.map(e => e.project), ['chromium', 'firefox']);
});
test('RPT-003: supports reports without AI recovery fields', t => {
  const report = emptyReport(); delete report.aiRecovery;
  report.tests = [{ title: 'Legacy test', project: 'chromium', status: 'passed', healingEvents: [] }];
  report.totalAttempts = 1; report.passedAttempts = 1;
  const { data } = readResult(t, report);
  assert.equal(data.aiRecovery.totalEvaluations, 0);
  assert.deepEqual(data.aiEvents, []);
});
test('RPT-004: rejects malformed summary JSON', t => {
  const files = createFixture(t, emptyReport());
  fs.writeFileSync(files.summary, '{invalid-json');
  const result = generate(files);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid JSON/);
  assert.equal(fs.existsSync(files.output), false);
});
test('RPT-005: rejects summary without tests array', t => {
  const result = generate(createFixture(t, { overallStatus: 'passed' }));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /tests array missing/);
});
test('RPT-006: handles missing optional reliability report', t => {
  assert.equal(readResult(t, emptyReport()).data.reliability, null);
});
test('RPT-007: rejects unsupported reliability schema', t => {
  const result = generate(createFixture(t, emptyReport(), { schemaVersion: 999, trend: [] }));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unsupported reliability report format/);
});
test('RPT-008: escapes malicious HTML in embedded data', t => {
  const report = emptyReport();
  const malicious = '</script><script>alert(1)</script>';
  report.tests = [{ title: malicious, project: 'chromium', status: 'passed', healingEvents: [], aiRecoveryEvents: [] }];
  report.totalAttempts = 1; report.passedAttempts = 1;
  const { html, data } = readResult(t, report);
  assert.equal(data.tests[0].title, malicious);
  assert.equal(html.includes(malicious), false);
  assert.ok(html.includes('\\u003c'));
});
test('RPT-009: excludes raw selectors from AI audit rows', t => {
  const report = emptyReport();
  addAIEvent(report, { evaluatedCandidates: 1, analytics: undefined, primarySelector: '#private-primary', suggestedSelector: '#private-suggestion', rawDOM: '<input type="password">' });
  const { data } = readResult(t, report);
  assert.equal(data.aiEvents.length, 1);
  for (const key of ['primarySelector', 'suggestedSelector', 'rawDOM']) assert.equal(Object.hasOwn(data.aiEvents[0], key), false);
});

test('RPT-010: aggregates decision analytics from events', t => {
  const report = emptyReport();
  addAIEvent(report);
  report.tests.push({ title: 'Second recovery', project: 'firefox', status: 'passed', healingEvents: [], aiRecoveryEvents: [{ event: 'AI_RECOVERY_EVALUATED', timestamp: '2026-11-05T07:01:00Z', status: 'NO_CANDIDATE', provider: 'mock', evaluatedCandidates: 2, analytics: { acceptedCandidates: 0, rejectedCandidates: 2, notEvaluatedCandidates: 0, validationDurationMs: 80, rejectionReasons: { NO_MATCH: 1, NOT_VISIBLE: 1 } } }] });
  const { data } = readResult(t, report);
  assert.deepEqual(data.aiRecovery.decisionAnalytics, { eventsWithAnalytics: 2, acceptedCandidates: 1, rejectedCandidates: 3, notEvaluatedCandidates: 1, totalValidationDurationMs: 200, averageValidationDurationMs: 100, rejectionReasons: { NO_MATCH: 2, NOT_VISIBLE: 1 } });
});
test('RPT-011: legacy AI events have no decision analytics', t => {
  const report = emptyReport(); addAIEvent(report, { analytics: undefined });
  const { data } = readResult(t, report);
  assert.equal(data.aiEvents[0].analytics, null);
  assert.deepEqual(data.aiRecovery.decisionAnalytics, { eventsWithAnalytics: 0, acceptedCandidates: 0, rejectedCandidates: 0, notEvaluatedCandidates: 0, totalValidationDurationMs: 0, averageValidationDurationMs: null, rejectionReasons: {} });
});
test('RPT-012: dashboard contains decision cards, charts, and event columns', t => {
  const { html } = readResult(t, emptyReport());
  for (const id of ['decisionAccepted', 'decisionRejected', 'decisionSkipped', 'decisionDuration', 'decisionBars', 'rejectionBars', 'decisionCoverage']) assert.ok(html.includes(`id="${id}"`), `Missing ${id}`);
  assert.match(html, /Decisions \(A\/R\/N\)/);
  assert.match(html, /AI rejection reasons/);
});
test('RPT-013: nested private AI fields are excluded from HTML', t => {
  const report = emptyReport();
  addAIEvent(report, { analytics: { acceptedCandidates: 1, rejectedCandidates: 1, notEvaluatedCandidates: 1, validationDurationMs: 120, rejectionReasons: { NO_MATCH: 1, SECRET_REASON: 9 }, suggestedSelector: '#secret-nested-selector', rawDOM: 'SECRET_NESTED_DOM', metadata: { token: 'SECRET_TOKEN' } } });
  const { html, data } = readResult(t, report);
  assert.deepEqual(data.aiEvents[0].analytics.rejectionReasons, { NO_MATCH: 1 });
  for (const secret of ['#secret-nested-selector', 'SECRET_NESTED_DOM', 'SECRET_TOKEN', 'SECRET_REASON']) assert.equal(html.includes(secret), false, `Leaked ${secret}`);
});
test('RPT-014: ignores unsupported rejection reasons and invalid reason counts', t => {
  const report = emptyReport();
  addAIEvent(report, { analytics: { acceptedCandidates: 1, rejectedCandidates: 1, notEvaluatedCandidates: 1, validationDurationMs: 120, rejectionReasons: { NO_MATCH: 1, NOT_VISIBLE: -2, NOT_SELECTED: 1.5, CUSTOM_REASON: 5 } } });
  const { data } = readResult(t, report);
  assert.deepEqual(data.aiRecovery.decisionAnalytics.rejectionReasons, { NO_MATCH: 1 });
});
test('RPT-015: invalid analytics numbers are sanitized', t => {
  const report = emptyReport();
  addAIEvent(report, { analytics: { acceptedCandidates: -1, rejectedCandidates: 1.25, notEvaluatedCandidates: '4', validationDurationMs: -5, rejectionReasons: {} } });
  const { data } = readResult(t, report);
  const a = data.aiEvents[0].analytics;
  assert.equal(a.acceptedCandidates, 0);
  assert.equal(a.rejectedCandidates, 0);
  assert.equal(a.notEvaluatedCandidates, 0);
  assert.equal(a.validationDurationMs, 0);
});
test('RPT-016: average duration is based only on analytics-bearing events', t => {
  const report = emptyReport();
  addAIEvent(report, { analytics: { acceptedCandidates: 1, rejectedCandidates: 1, notEvaluatedCandidates: 1, validationDurationMs: 100, rejectionReasons: { NO_MATCH: 1 } } });
  report.tests[0].aiRecoveryEvents.push({ event: 'AI_RECOVERY_EVALUATED', timestamp: '2026-11-05T07:02:00Z', status: 'DISABLED', provider: 'mock', evaluatedCandidates: 0 });
  const { data } = readResult(t, report);
  assert.equal(data.aiRecovery.decisionAnalytics.eventsWithAnalytics, 1);
  assert.equal(data.aiRecovery.decisionAnalytics.averageValidationDurationMs, 100);
});
test('RPT-017: averages fractional validation durations to three decimals', t => {
  const report = emptyReport();
  addAIEvent(report, { analytics: { acceptedCandidates: 1, rejectedCandidates: 1, notEvaluatedCandidates: 1, validationDurationMs: 1, rejectionReasons: { NO_MATCH: 1 } } });
  report.tests[0].aiRecoveryEvents.push({ event: 'AI_RECOVERY_EVALUATED', timestamp: '2026-11-05T07:03:00Z', status: 'FAILED', provider: 'mock', evaluatedCandidates: 0, analytics: { acceptedCandidates: 0, rejectedCandidates: 0, notEvaluatedCandidates: 0, validationDurationMs: 0, rejectionReasons: {} } });
  report.tests[0].aiRecoveryEvents.push({ event: 'AI_RECOVERY_EVALUATED', timestamp: '2026-11-05T07:04:00Z', status: 'FAILED', provider: 'mock', evaluatedCandidates: 0, analytics: { acceptedCandidates: 0, rejectedCandidates: 0, notEvaluatedCandidates: 0, validationDurationMs: 0, rejectionReasons: {} } });
  const { data } = readResult(t, report);
  assert.equal(data.aiRecovery.decisionAnalytics.averageValidationDurationMs, 0.333);
});
test('RPT-018: event analytics preserve only explicitly supported fields', t => {
  const report = emptyReport();
  addAIEvent(report, { analytics: { acceptedCandidates: 1, rejectedCandidates: 1, notEvaluatedCandidates: 1, validationDurationMs: 120, rejectionReasons: { NO_MATCH: 1 }, internalTrace: 'PRIVATE_TRACE' } });
  const { data, html } = readResult(t, report);
  assert.deepEqual(Object.keys(data.aiEvents[0].analytics).sort(), ['acceptedCandidates', 'notEvaluatedCandidates', 'rejectedCandidates', 'rejectionReasons', 'validationDurationMs'].sort());
  assert.equal(html.includes('PRIVATE_TRACE'), false);
});

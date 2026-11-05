
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
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'autoheal-reporting-')
  );

  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const summary = path.join(dir, 'summary.json');
  const output = path.join(dir, 'analytics.html');
  const history = path.join(dir, 'reliability.json');

  fs.writeFileSync(
    summary,
    JSON.stringify(report),
    'utf8'
  );

  if (reliability !== undefined) {
    fs.writeFileSync(
      history,
      JSON.stringify(reliability),
      'utf8'
    );
  }

  return { summary, output, history };
}

function generate(files) {
  return spawnSync(
    process.execPath,
    [generator, files.summary, files.output, files.history],
    {
      encoding: 'utf8',
      timeout: 15000
    }
  );
}

function emptyReport() {
  return {
    overallStatus: 'passed',
    totalAttempts: 0,
    passedAttempts: 0,
    tests: [],
    healing: {
      totalEvents: 0,
      healedAttempts: 0,
      averageConfidence: null
    },
    aiRecovery: {
      totalEvaluations: 0,
      suggested: 0,
      noCandidate: 0,
      disabled: 0,
      failed: 0,
      evaluatedCandidates: 0,
      averageConfidence: null,
      events: []
    }
  };
}

function readEmbeddedData(html) {
  const match = html.match(
    /<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/
  );

  assert.ok(match, 'Embedded report data is missing');
  return JSON.parse(match[1]);
}

test('RPT-001: generates analytics for an empty report', t => {
  const files = createFixture(t, emptyReport());
  const result = generate(files);

  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(files.output));

  const html = fs.readFileSync(files.output, 'utf8');
  const data = readEmbeddedData(html);

  assert.equal(data.total, 0);
  assert.equal(data.aiRecovery.totalEvaluations, 0);
  assert.deepEqual(data.aiEvents, []);
});

test('RPT-002: aggregates AI events by browser', t => {
  const report = emptyReport();

  report.totalAttempts = 2;
  report.passedAttempts = 2;
  report.aiRecovery = undefined;

  report.tests = [
    {
      title: 'AI suggestion test',
      project: 'chromium',
      status: 'passed',
      healingEvents: [],
      aiRecoveryEvents: [{
        event: 'AI_RECOVERY_EVALUATED',
        timestamp: '2026-11-05T07:00:00Z',
        status: 'SUGGESTED',
        provider: 'mock',
        evaluatedCandidates: 1,
        confidence: 0.95
      }]
    },
    {
      title: 'Provider failure test',
      project: 'firefox',
      status: 'passed',
      healingEvents: [],
      aiRecoveryEvents: [{
        event: 'AI_RECOVERY_EVALUATED',
        timestamp: '2026-11-05T07:01:00Z',
        status: 'FAILED',
        provider: 'mock',
        evaluatedCandidates: 0,
        reason: 'RECOVERY_PIPELINE_FAILED'
      }]
    }
  ];

  const files = createFixture(t, report);
  const result = generate(files);

  assert.equal(result.status, 0, result.stderr);

  const data = readEmbeddedData(
    fs.readFileSync(files.output, 'utf8')
  );

  assert.equal(data.aiRecovery.totalEvaluations, 2);
  assert.equal(data.aiRecovery.suggested, 1);
  assert.equal(data.aiRecovery.failed, 1);
  assert.equal(data.aiRecovery.evaluatedCandidates, 1);
  assert.equal(data.aiEvents.length, 2);

  assert.deepEqual(
    data.aiEvents.map(event => event.project),
    ['chromium', 'firefox']
  );
});

test('RPT-003: supports reports without AI recovery fields', t => {
  const report = emptyReport();
  delete report.aiRecovery;

  report.tests = [{
    title: 'Legacy test',
    project: 'chromium',
    status: 'passed',
    healingEvents: []
  }];

  report.totalAttempts = 1;
  report.passedAttempts = 1;

  const files = createFixture(t, report);
  const result = generate(files);

  assert.equal(result.status, 0, result.stderr);

  const data = readEmbeddedData(
    fs.readFileSync(files.output, 'utf8')
  );

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
  const files = createFixture(t, {
    overallStatus: 'passed'
  });

  const result = generate(files);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /tests array missing/);
});

test('RPT-006: handles missing optional reliability report', t => {
  const files = createFixture(t, emptyReport());

  const result = generate(files);

  assert.equal(result.status, 0, result.stderr);

  const data = readEmbeddedData(
    fs.readFileSync(files.output, 'utf8')
  );

  assert.equal(data.reliability, null);
});

test('RPT-007: rejects unsupported reliability schema', t => {
  const files = createFixture(
    t,
    emptyReport(),
    { schemaVersion: 999, trend: [] }
  );

  const result = generate(files);

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /Unsupported reliability report format/
  );
});

test('RPT-008: escapes malicious HTML in embedded data', t => {
  const report = emptyReport();

  const malicious = '</script><script>alert(1)</script>';

  report.tests = [{
    title: malicious,
    project: 'chromium',
    status: 'passed',
    healingEvents: [],
    aiRecoveryEvents: []
  }];

  report.totalAttempts = 1;
  report.passedAttempts = 1;

  const files = createFixture(t, report);
  const result = generate(files);

  assert.equal(result.status, 0, result.stderr);

  const html = fs.readFileSync(files.output, 'utf8');
  const data = readEmbeddedData(html);

  assert.equal(data.tests[0].title, malicious);
  assert.equal(html.includes(malicious), false);
  assert.ok(html.includes('\\u003c'));
});

test('RPT-009: excludes raw selectors from AI audit rows', t => {
  const report = emptyReport();

  report.tests = [{
    title: 'Privacy test',
    project: 'webkit',
    status: 'passed',
    healingEvents: [],
    aiRecoveryEvents: [{
      event: 'AI_RECOVERY_EVALUATED',
      timestamp: '2026-11-05T07:00:00Z',
      status: 'SUGGESTED',
      provider: 'mock',
      evaluatedCandidates: 1,
      confidence: 0.95,
      primarySelector: '#private-primary',
      suggestedSelector: '#private-suggestion',
      rawDOM: '<input type="password">'
    }]
  }];

  report.aiRecovery = undefined;

  const files = createFixture(t, report);
  const result = generate(files);

  assert.equal(result.status, 0, result.stderr);

  const data = readEmbeddedData(
    fs.readFileSync(files.output, 'utf8')
  );

  assert.equal(data.aiEvents.length, 1);
  assert.equal(
    Object.hasOwn(data.aiEvents[0], 'primarySelector'),
    false
  );
  assert.equal(
    Object.hasOwn(data.aiEvents[0], 'suggestedSelector'),
    false
  );
  assert.equal(
    Object.hasOwn(data.aiEvents[0], 'rawDOM'),
    false
  );
});

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const summaryFile = path.resolve(process.argv[2] || 'reports/autoheal/summary.json');
const outputFile = path.resolve(process.argv[3] || 'reports/autoheal/analytics.html');
const reliabilityFile = path.resolve(process.argv[4] || 'reports/autoheal/reliability.json');
function readJSON(file, required = false) {
  if (!fs.existsSync(file)) {
    if (required) throw new Error(`Required report not found: ${file}`);
    console.warn(`[AutoHeal QA] Optional reliability report missing: ${file}`);
    return null;
  }
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error(`Invalid JSON in ${file}: ${error.message}`); }
}
try {
  const report = readJSON(summaryFile, true);
  if (!report || !Array.isArray(report.tests)) throw new Error('Invalid summary format: tests array missing.');
  const reliability = readJSON(reliabilityFile);
  if (reliability && (reliability.schemaVersion !== 1 || !Array.isArray(reliability.trend))) throw new Error('Unsupported reliability report format.');
  const tests = report.tests;
  const allowedReasons = new Set([
    'INVALID_SELECTOR', 'INVALID_CONFIDENCE', 'LOW_CONFIDENCE',
    'NO_MATCH', 'AMBIGUOUS_MATCH', 'NOT_VISIBLE', 'UNSAFE_TARGET',
    'NOT_UNIQUE', 'DUPLICATE_SELECTOR', 'MALFORMED_CANDIDATE',
    'VALIDATION_TIMEOUT', 'NOT_SELECTED'
  ]);
  const safeCount = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  const safeDuration = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
  // Explicitly project analytics fields: never embed untrusted selector/DOM fields.
  function safeDecision(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const reasons = {};
    if (value.rejectionReasons && typeof value.rejectionReasons === 'object' && !Array.isArray(value.rejectionReasons)) {
      for (const [reason, count] of Object.entries(value.rejectionReasons)) {
        if (allowedReasons.has(reason) && Number.isSafeInteger(count) && count >= 0) reasons[reason] = count;
      }
    }
    return {
      acceptedCandidates: safeCount(value.acceptedCandidates),
      rejectedCandidates: safeCount(value.rejectedCandidates),
      notEvaluatedCandidates: safeCount(value.notEvaluatedCandidates),
      validationDurationMs: safeDuration(value.validationDurationMs),
      rejectionReasons: reasons
    };
  }
  // PHASE_4_7_STEP_3_OBSERVABILITY
  const recoveryStages = [
    'CONFIGURATION', 'AUTHORIZATION', 'DOM_EXTRACTION',
    'PROVIDER', 'VALIDATION', 'RANKING', 'COMPLETED'
  ];
  const recoveryStageSet = new Set(recoveryStages);
  const recoveryIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function safeRecoveryMetadata(event) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
    const diag = event.diagnostics;
    if (!diag || typeof diag !== 'object' || Array.isArray(diag)) return null;
    if (typeof event.recoveryId !== 'string' || !recoveryIdPattern.test(event.recoveryId)) return null;
    if (diag.recoveryId !== event.recoveryId || !recoveryStageSet.has(diag.stage)) return null;
    if (typeof diag.durationMs !== 'number' || !Number.isFinite(diag.durationMs) || diag.durationMs < 0) return null;
    if (typeof diag.timedOut !== 'boolean') return null;
    if (diag.timedOut && event.status !== 'FAILED') return null;
    return {
      recoveryId: event.recoveryId,
      diagnostics: {
        recoveryId: event.recoveryId,
        stage: diag.stage,
        durationMs: diag.durationMs,
        timedOut: diag.timedOut
      }
    };
  }
  const events = tests.flatMap(t => (Array.isArray(t.healingEvents) ? t.healingEvents : []).map(e => ({...e, project: t.project || 'unknown', test: t.title || ''})));
  const aiEvents = tests.flatMap(t =>
    (Array.isArray(t.aiRecoveryEvents) ? t.aiRecoveryEvents : []).map(e => ({
      timestamp: e.timestamp,
      status: e.status,
      provider: e.provider,
      evaluatedCandidates: e.evaluatedCandidates,
      confidence: e.confidence ?? null,
      reason: e.reason ?? '',
      analytics: safeDecision(e.analytics),
      ...safeRecoveryMetadata(e),
      project: String(t.project || 'unknown'),
      test: String(t.title || '')
    }))
  );
  const ai = report.aiRecovery || {};
  const aiRecovery = {
    totalEvaluations: Number(ai.totalEvaluations ?? aiEvents.length),
    suggested: Number(ai.suggested ?? aiEvents.filter(e => e.status === 'SUGGESTED').length),
    noCandidate: Number(ai.noCandidate ?? aiEvents.filter(e => e.status === 'NO_CANDIDATE').length),
    disabled: Number(ai.disabled ?? aiEvents.filter(e => e.status === 'DISABLED').length),
    failed: Number(ai.failed ?? aiEvents.filter(e => e.status === 'FAILED').length),
    evaluatedCandidates: Number(ai.evaluatedCandidates ?? aiEvents.reduce((n,e) => n + e.evaluatedCandidates, 0)),
    averageConfidence: ai.averageConfidence == null ? null : Number(ai.averageConfidence)
  };
  const analyticsEvents = aiEvents.filter(e => e.analytics !== null);
  const calculatedReasons = {};
  const decisionTotals = {
    eventsWithAnalytics: analyticsEvents.length,
    acceptedCandidates: 0,
    rejectedCandidates: 0,
    notEvaluatedCandidates: 0,
    totalValidationDurationMs: 0,
    averageValidationDurationMs: null,
    rejectionReasons: calculatedReasons
  };
  for (const event of analyticsEvents) {
    const a = event.analytics;
    decisionTotals.acceptedCandidates += a.acceptedCandidates;
    decisionTotals.rejectedCandidates += a.rejectedCandidates;
    decisionTotals.notEvaluatedCandidates += a.notEvaluatedCandidates;
    decisionTotals.totalValidationDurationMs += a.validationDurationMs;
    for (const [reason, count] of Object.entries(a.rejectionReasons)) {
      calculatedReasons[reason] = (calculatedReasons[reason] || 0) + count;
    }
  }
  if (analyticsEvents.length) {
    decisionTotals.averageValidationDurationMs = Number(
      (decisionTotals.totalValidationDurationMs / analyticsEvents.length).toFixed(3)
    );
  }
  // Event data is the source of truth for this display, including historical reports.
  aiRecovery.decisionAnalytics = decisionTotals;
  const observedRecoveries = aiEvents.filter(e => e.diagnostics !== undefined);
  const recoveryObservability = {
    eventsWithDiagnostics: observedRecoveries.length,
    legacyEvents: aiEvents.length - observedRecoveries.length,
    timedOut: observedRecoveries.filter(e => e.diagnostics.timedOut).length,
    averageDurationMs: observedRecoveries.length
      ? Number((observedRecoveries.reduce((sum, e) => sum + e.diagnostics.durationMs, 0) / observedRecoveries.length).toFixed(3))
      : null,
    maximumDurationMs: observedRecoveries.length
      ? Math.max(...observedRecoveries.map(e => e.diagnostics.durationMs))
      : null,
    stages: Object.fromEntries(recoveryStages.map(stage => [stage,
      observedRecoveries.filter(e => e.diagnostics.stage === stage).length]))
  };
  recoveryObservability.timeoutRatePercent = observedRecoveries.length
    ? Number((100 * recoveryObservability.timedOut / observedRecoveries.length).toFixed(2))
    : null;
  aiRecovery.observability = recoveryObservability;
  const projects = [...new Set(tests.map(t => String(t.project || 'unknown')))];
  const browsers = projects.map(project => {
    const rows = tests.filter(t => String(t.project || 'unknown') === project);
    return {project, total: rows.length, passed: rows.filter(t => t.status === 'passed').length, healed: rows.reduce((n,t) => n + (t.healingEvents?.length || 0),0)};
  });
  const data = {
    status: String(report.overallStatus || 'unknown'),
    startedAt: report.startedAt || null,
    finishedAt: report.finishedAt || null,
    total: Number(report.totalAttempts ?? tests.length),
    passed: Number(report.passedAttempts ?? 0),
    healingCount: Number(report.healing?.totalEvents ?? events.length),
    healedAttempts: Number(report.healing?.healedAttempts ?? 0),
    confidence: report.healing?.averageConfidence == null ? null : Number(report.healing.averageConfidence),
    browsers, events, aiEvents, aiRecovery,
    tests: tests.map(t => ({title: String(t.title || ''), project: String(t.project || 'unknown'), status: String(t.status || ''), durationMs: Number(t.durationMs || 0), retry: Number(t.retry || 0), healingCount: t.healingEvents?.length || 0, aiCount: t.aiRecoveryEvents?.length || 0})),
    reliability: reliability ? {
      runCount: reliability.runCount,
      passRatePercent: reliability.passRatePercent,
      trend: reliability.trend,
      browsers: reliability.browsers || [],
      recurringSelectors: reliability.recurringSelectors || [],
      possibleFlakyTests: reliability.possibleFlakyTests || [],
      testsWithRetries: reliability.testsWithRetries || []
    } : null
  };
  // Escape HTML-sensitive characters before placing JSON inside a script element.
  const embedded = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AutoHeal QA | Analytics</title>
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;background:#090e1a;color:#e7ecf8}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 85% -10%,#19345c 0,transparent 37%),#090e1a}.shell{max-width:1250px;margin:auto;padding:40px 24px 80px}.eyebrow{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#7bb8ff;font-weight:700}h1{font-size:clamp(30px,5vw,48px);margin:10px 0}p{color:#a6b5d1;line-height:1.55}.header{display:flex;justify-content:space-between;gap:20px;align-items:center;flex-wrap:wrap;margin-bottom:28px}.pill{border:1px solid #2b4662;background:#10243b;border-radius:999px;padding:9px 16px;color:#a7e6ca;font-weight:700}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:15px}.card,.panel{background:#111a2b;border:1px solid #25334a;border-radius:18px;padding:22px;box-shadow:0 14px 32px #0002}.card small{display:block;color:#91a5c6;font-size:13px}.number{font-size:34px;font-weight:800;margin:12px 0 3px}.green{color:#63e0aa}.blue{color:#79b6ff}.panel{margin-top:18px}h2{font-size:19px;margin:0 0 18px}.layout{display:grid;grid-template-columns:1fr 1fr;gap:18px}.bars{display:grid;gap:15px}.barrow{display:grid;grid-template-columns:minmax(100px,1fr) 2fr 75px;gap:12px;align-items:center;font-size:13px}.barrow span{overflow-wrap:anywhere}.track{height:11px;background:#25344b;border-radius:20px;overflow:hidden}.fill{height:100%;background:linear-gradient(90deg,#478de8,#6de1c3);border-radius:20px}.muted{color:#90a2bf}.tablewrap{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:650px;text-align:left}th,td{padding:13px 11px;border-bottom:1px solid #263449;font-size:13px}th{color:#8ea8ca;font-weight:600}td{color:#d6e1f5}code{font-size:12px;color:#a9d5ff;overflow-wrap:anywhere}.filters{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}select,input{background:#0b1424;color:#e8f0ff;border:1px solid #33425c;border-radius:10px;padding:10px 12px;max-width:100%}input{min-width:230px;flex:1}.empty{color:#9caecb;padding:12px 0}.foot{margin-top:20px;font-size:12px;color:#8296b5}.sectiontitle{margin-top:32px;color:#a8c9ff;font-size:13px;letter-spacing:.14em;text-transform:uppercase}.hint{font-size:12px}.smallgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.mini{border:1px solid #293d58;border-radius:12px;padding:14px}.mini strong{display:block;font-size:24px;margin-top:8px}.ai-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:15px}.ai-metrics .card{padding:18px}.ai-note{border-left:3px solid #79b6ff;padding-left:12px}.decision-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:15px}.decision-grid .card{padding:18px}.recovery-id{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;overflow-wrap:anywhere}.observability-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:15px}.observability-grid .card{padding:18px}@media(max-width:800px){.observability-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:520px){.observability-grid{grid-template-columns:1fr}}@media(max-width:800px){.ai-metrics,.decision-grid{grid-template-columns:repeat(2,1fr)}.metrics{grid-template-columns:repeat(2,1fr)}.layout{grid-template-columns:1fr}}@media(max-width:520px){.ai-metrics,.decision-grid,.metrics,.smallgrid{grid-template-columns:1fr}.shell{padding:24px 14px}.barrow{grid-template-columns:90px 1fr 60px}}
</style></head><body><main class="shell"><header class="header"><div><div class="eyebrow">Quality Engineering / Analytics</div><h1>AutoHeal QA <span class="blue">Insights</span></h1><p id="period">Playwright test execution and self-healing intelligence</p></div><span class="pill" id="overall">Report loaded</span></header>
<section class="metrics"><div class="card"><small>Total test attempts</small><div class="number" id="total">—</div><small>Across configured projects</small></div><div class="card"><small>Passed attempts</small><div class="number green" id="passed">—</div><small id="passrate">Pass rate</small></div><div class="card"><small>Healing events</small><div class="number blue" id="heal">—</div><small id="healedattempts">Recovered attempts</small></div><div class="card"><small>Average selector confidence</small><div class="number" id="confidence">—</div><small>Configured recovery confidence, not success probability</small></div></section>
<section class="layout"><div class="panel"><h2>Browser execution — latest run</h2><div id="browserBars" class="bars"></div></div><div class="panel"><h2>Healing by browser — latest run</h2><div id="healingBars" class="bars"></div></div></section>
<div class="sectiontitle">Advisory AI recovery — latest run</div>
<p class="ai-note">AI suggestions are advisory only. They are never executed automatically and do not count as deterministic locator healing.</p>
<section class="ai-metrics">
<div class="card"><small>AI evaluations</small><div class="number blue" id="aiTotal">—</div><small>Recorded audit events</small></div>
<div class="card"><small>AI suggestions</small><div class="number" id="aiSuggested">—</div><small>Not executed</small></div>
<div class="card"><small>AI provider failures</small><div class="number" id="aiFailed">—</div><small>Controlled failures</small></div>
<div class="card"><small>AI suggestion confidence</small><div class="number" id="aiConfidence">—</div><small>Not a success probability</small></div>
</section>
<section class="layout"><div class="panel"><h2>AI recovery outcomes</h2><div id="aiStatusBars" class="bars"></div></div><div class="panel"><h2>AI evaluations by browser</h2><div id="aiBrowserBars" class="bars"></div></div></section>
<div class="sectiontitle">Explainable AI — candidate decisions</div>
 <p class="hint">Decision metrics cover only AI events with explanation analytics. They are advisory, not automatic execution outcomes.</p>
 <section class="decision-grid">
 <div class="card"><small>Accepted candidates</small><div class="number green" id="decisionAccepted">—</div><small>Validated suggestions</small></div>
 <div class="card"><small>Rejected candidates</small><div class="number" id="decisionRejected">—</div><small>Rejected during validation</small></div>
 <div class="card"><small>Not evaluated</small><div class="number blue" id="decisionSkipped">—</div><small>Unassessed candidates</small></div>
 <div class="card"><small>Average validation time</small><div class="number" id="decisionDuration">—</div><small id="decisionCoverage">Events with analytics</small></div>
 </section>
 <section class="layout"><div class="panel"><h2>Candidate decision breakdown</h2><div id="decisionBars" class="bars"></div></div><div class="panel"><h2>AI rejection reasons</h2><div id="rejectionBars" class="bars"></div><p class="hint">A rejected candidate may have multiple reasons.</p></div></section>
 <div class="sectiontitle">AI recovery observability — latest run</div>
 <p class="hint" id="recoveryCoverage">Recovery diagnostics coverage</p>
 <section class="observability-grid">
 <div class="card"><small>Recoveries with diagnostics</small><div class="number blue" id="recoveryObserved">—</div><small>Correlated events</small></div>
 <div class="card"><small>Timed-out recoveries</small><div class="number" id="recoveryTimeouts">—</div><small id="recoveryTimeoutRate">Timeout rate</small></div>
 <div class="card"><small>Average recovery duration</small><div class="number" id="recoveryAverage">—</div><small>Observed events only</small></div>
 <div class="card"><small>Maximum recovery duration</small><div class="number" id="recoveryMaximum">—</div><small>Observed events only</small></div>
 </section>
 <section class="panel"><h2>Recovery stage distribution</h2><div class="bars" id="recoveryStageBars"></div></section>
 <section class="panel"><h2>Recovery diagnostics history</h2><div class="filters"><select id="recoveryStageFilter" aria-label="Filter recovery diagnostics by stage"><option value="">All stages</option></select><select id="recoveryTimeoutFilter" aria-label="Filter recovery diagnostics by timeout"><option value="">All outcomes</option><option value="true">Timed out</option><option value="false">Not timed out</option></select><input id="recoverySearch" aria-label="Search recovery diagnostics" placeholder="Search recovery ID, test or provider…"></div><div class="tablewrap"><table><thead><tr><th>Recovery ID</th><th>Test</th><th>Browser</th><th>Provider</th><th>Status</th><th>Stage</th><th>Duration</th><th>Timed out</th></tr></thead><tbody id="recoveryHistoryBody"></tbody></table></div><p class="empty" id="recoveryHistoryEmpty" hidden>No matching recovery diagnostics.</p></section>
 <section class="panel"><h2>AI recovery audit events</h2><div class="filters"><select id="aiBrowserFilter" aria-label="Filter AI recovery events by browser"><option value="">All browsers</option></select><select id="aiStatusFilter" aria-label="Filter AI recovery events by status"><option value="">All statuses</option><option value="SUGGESTED">Suggested</option><option value="NO_CANDIDATE">No candidate</option><option value="DISABLED">Disabled</option><option value="FAILED">Failed</option></select><input id="aiSearch" aria-label="Search AI recovery events" placeholder="Search test, provider or reason…"></div><div class="tablewrap"><table><thead><tr><th>Time</th><th>Browser</th><th>Test</th><th>Status</th><th>Provider</th><th>Candidates</th><th>Confidence</th><th>Reason</th><th>Decisions (A/R/N)</th><th>Validation</th></tr></thead><tbody id="aiEventsBody"></tbody></table></div><p id="aiEventEmpty" class="empty" hidden>No matching AI recovery events.</p></section>
<div class="sectiontitle">Historical reliability</div><div class="panel"><h2>Across saved executions</h2><div id="historySummary" class="smallgrid"></div><p class="hint" id="historyHint"></p></div>
<section class="layout"><div class="panel"><h2>Pass rate by run</h2><div id="passTrend" class="bars"></div></div><div class="panel"><h2>Healing events by run</h2><div id="healingTrend" class="bars"></div></div></section>
<section class="layout"><div class="panel"><h2>Browser reliability — all saved runs</h2><div id="browserReliability" class="bars"></div></div><div class="panel"><h2>Frequently recovered selectors</h2><div id="selectors" class="bars"></div><p class="hint">Controlled self-healing test fixtures may intentionally generate these recoveries.</p></div></section>
<section class="panel"><h2>Possible flaky tests</h2><p class="hint">A candidate must have both passed and failed attempts across saved executions. This is an indicator, not a diagnosis.</p><div class="tablewrap"><table><thead><tr><th>Test</th><th>Browser</th><th>Passed</th><th>Failed</th><th>Pass rate</th></tr></thead><tbody id="flakyBody"></tbody></table></div><p id="flakyEmpty" class="empty" hidden>No possible flaky tests detected in saved history.</p></section>
<div class="sectiontitle">Latest execution details</div>
<section class="panel"><h2>Healing events — latest run</h2><div class="filters"><select id="browserFilter" aria-label="Filter healing events by browser"><option value="">All browsers</option></select><input id="eventSearch" aria-label="Search healing events" placeholder="Search selector or strategy…"></div><div class="tablewrap"><table><thead><tr><th>Time</th><th>Browser</th><th>Original selector</th><th>Recovered selector</th><th>Strategy</th><th>Confidence</th></tr></thead><tbody id="eventsBody"></tbody></table></div><p id="eventEmpty" class="empty" hidden>No matching healing events.</p></section>
<section class="panel"><h2>Test execution details — latest run</h2><div class="filters"><select id="testBrowserFilter" aria-label="Filter tests by browser"><option value="">All browsers</option></select><input id="testSearch" aria-label="Search tests" placeholder="Search test names…"></div><div class="tablewrap"><table><thead><tr><th>Test</th><th>Browser</th><th>Status</th><th>Duration</th><th>Retries</th><th>Heals</th><th>AI evaluations</th></tr></thead><tbody id="testsBody"></tbody></table></div><p id="testEmpty" class="empty" hidden>No matching tests.</p></section><div class="foot">Standalone snapshot generated from summary.json and optional reliability.json. Run the generators again to refresh. Review report contents before publishing.</div></main>
<script id="report-data" type="application/json">${embedded}</script><script>
'use strict';
const d=JSON.parse(document.getElementById('report-data').textContent);
const el=id=>document.getElementById(id);
const fmtDate=value=>value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString() : 'Unknown';
const pct=value=>value==null || !Number.isFinite(Number(value)) ? '—' : Number(value).toFixed(1).replace(/\\.0$/,'')+'%';
const add=(parent,tag,value,cls)=>{const node=document.createElement(tag);node.textContent=String(value);if(cls)node.className=cls;parent.append(node);return node;};
const empty=(root,message)=>add(root,'p',message,'empty');
function bar(root,label,value,max,display){const row=add(root,'div','','barrow');add(row,'span',label);const track=add(row,'div','','track');const fill=add(track,'div','','fill');fill.style.width=(Math.max(0,Math.min(100,100*Number(value||0)/Math.max(1,max))))+'%';add(row,'strong',display);}
function cell(row,value,code=false){const td=document.createElement('td');if(code)add(td,'code',value);else td.textContent=String(value);row.append(td);}
el('overall').textContent='Run status: '+d.status.toUpperCase();el('period').textContent=fmtDate(d.startedAt)+' — '+fmtDate(d.finishedAt);
el('total').textContent=d.total;el('passed').textContent=d.passed;el('heal').textContent=d.healingCount;el('confidence').textContent=d.confidence==null?'—':pct(d.confidence*100);el('passrate').textContent=(d.total?pct(100*d.passed/d.total):'—')+' pass rate';el('healedattempts').textContent=d.healedAttempts+' healed attempts';
for(const b of d.browsers){bar(el('browserBars'),b.project,b.passed,b.total,b.passed+'/'+b.total);bar(el('healingBars'),b.project,b.healed,Math.max(1,...d.browsers.map(x=>x.healed)),b.healed);for(const id of ['browserFilter','testBrowserFilter']){const option=document.createElement('option');option.value=b.project;option.textContent=b.project;el(id).append(option);}}
if(!d.browsers.length){empty(el('browserBars'),'No browser data.');empty(el('healingBars'),'No healing data.');}
const ai=d.aiRecovery;
el('aiTotal').textContent=ai.totalEvaluations;
el('aiSuggested').textContent=ai.suggested;
el('aiFailed').textContent=ai.failed;
el('aiConfidence').textContent=ai.averageConfidence==null?'—':pct(ai.averageConfidence*100);
const aiStatuses=[['SUGGESTED',ai.suggested],['NO_CANDIDATE',ai.noCandidate],['DISABLED',ai.disabled],['FAILED',ai.failed]];
for(const [status,count] of aiStatuses)bar(el('aiStatusBars'),status,count,Math.max(1,...aiStatuses.map(x=>x[1])),count);
for(const b of d.browsers){
  const count=d.aiEvents.filter(e=>e.project===b.project).length;
  bar(el('aiBrowserBars'),b.project,count,Math.max(1,...d.browsers.map(x=>d.aiEvents.filter(e=>e.project===x.project).length)),count);
  const option=document.createElement('option');option.value=b.project;option.textContent=b.project;el('aiBrowserFilter').append(option);
}
if(!d.browsers.length)empty(el('aiBrowserBars'),'No browser data.');

const decision = ai.decisionAnalytics;
const hasDecisionAnalytics =
  decision && decision.eventsWithAnalytics > 0;

if (hasDecisionAnalytics) {
  el('decisionAccepted').textContent =
    decision.acceptedCandidates;

  el('decisionRejected').textContent =
    decision.rejectedCandidates;

  el('decisionSkipped').textContent =
    decision.notEvaluatedCandidates;

  el('decisionDuration').textContent =
    decision.averageValidationDurationMs == null
      ? '—'
      : decision.averageValidationDurationMs.toFixed(3) + ' ms';

  el('decisionCoverage').textContent =
    decision.eventsWithAnalytics + ' events with analytics';

  const candidateDecisions = [
    ['Accepted', decision.acceptedCandidates],
    ['Rejected', decision.rejectedCandidates],
    ['Not evaluated', decision.notEvaluatedCandidates]
  ];

  const maxCandidates = Math.max(
    1,
    ...candidateDecisions.map(item => item[1])
  );

  for (const [label, count] of candidateDecisions) {
    bar(el('decisionBars'), label, count, maxCandidates, count);
  }

  const rejectionReasons = Object.entries(
    decision.rejectionReasons || {}
  ).filter(([, count]) => count > 0);

  if (rejectionReasons.length > 0) {
    const maxReasons = Math.max(
      1,
      ...rejectionReasons.map(([, count]) => count)
    );

    for (const [reason, count] of rejectionReasons) {
      bar(el('rejectionBars'), reason, count, maxReasons, count);
    }
  } else {
    empty(el('rejectionBars'), 'No rejection reasons recorded.');
  }
} else {
  el('decisionCoverage').textContent =
    'No events with decision analytics';

  empty(el('decisionBars'), 'No candidate decision data.');
  empty(el('rejectionBars'), 'No rejection reasons recorded.');
}

const obs=ai.observability;
el('recoveryObserved').textContent=obs.eventsWithDiagnostics;
el('recoveryTimeouts').textContent=obs.timedOut;
el('recoveryTimeoutRate').textContent='Timeout rate: '+(obs.timeoutRatePercent==null?'—':pct(obs.timeoutRatePercent));
el('recoveryAverage').textContent=obs.averageDurationMs==null?'—':obs.averageDurationMs.toFixed(3)+' ms';
el('recoveryMaximum').textContent=obs.maximumDurationMs==null?'—':obs.maximumDurationMs.toFixed(3)+' ms';
el('recoveryCoverage').textContent=obs.eventsWithDiagnostics+' of '+d.aiEvents.length+' AI events have valid recovery diagnostics; '+obs.legacyEvents+' legacy or uncorrelated events.';
const stageEntries=Object.entries(obs.stages);
for(const [stage,count] of stageEntries){
  const option=document.createElement('option');option.value=stage;option.textContent=stage;el('recoveryStageFilter').append(option);
  bar(el('recoveryStageBars'),stage,count,Math.max(1,...stageEntries.map(x=>x[1])),count);
}
function renderRecoveryHistory(){
  const stage=el('recoveryStageFilter').value;
  const timeout=el('recoveryTimeoutFilter').value;
  const q=el('recoverySearch').value.trim().toLowerCase();
  const root=el('recoveryHistoryBody');root.replaceChildren();
  const rows=d.aiEvents.filter(e=>e.diagnostics&&(!stage||e.diagnostics.stage===stage)&&(!timeout||String(e.diagnostics.timedOut)===timeout)&&[e.recoveryId,e.test,e.provider,e.project,e.status].join(' ').toLowerCase().includes(q));
  for(const e of rows){const row=document.createElement('tr');cell(row,e.recoveryId,true);cell(row,e.test);cell(row,e.project);cell(row,e.provider);cell(row,e.status);cell(row,e.diagnostics.stage);cell(row,e.diagnostics.durationMs.toFixed(3)+' ms');cell(row,e.diagnostics.timedOut?'Yes':'No');root.append(row);}
  el('recoveryHistoryEmpty').hidden=rows.length>0;
}
for(const id of ['recoveryStageFilter','recoveryTimeoutFilter','recoverySearch'])el(id).addEventListener('input',renderRecoveryHistory);
renderRecoveryHistory();
function renderAIEvents(){
  const browser=el('aiBrowserFilter').value;
  const status=el('aiStatusFilter').value;
  const q=el('aiSearch').value.trim().toLowerCase();
  const root=el('aiEventsBody');root.replaceChildren();
  const matches=d.aiEvents.filter(e=>(!browser||e.project===browser)&&(!status||e.status===status)&&[e.test,e.provider,e.reason,e.status].join(' ').toLowerCase().includes(q));
  for(const e of matches){
    const row=document.createElement('tr');
    cell(row,fmtDate(e.timestamp));cell(row,e.project);cell(row,e.test);cell(row,e.status);cell(row,e.provider);cell(row,e.evaluatedCandidates);cell(row,e.confidence==null?'—':pct(e.confidence*100));cell(row,e.reason||'—');cell(row,e.analytics?[e.analytics.acceptedCandidates,e.analytics.rejectedCandidates,e.analytics.notEvaluatedCandidates].join(' / '):'—');cell(row,e.analytics?e.analytics.validationDurationMs.toFixed(3)+' ms':'—');root.append(row);
  }
  el('aiEventEmpty').hidden=matches.length>0;
}
for(const id of ['aiBrowserFilter','aiStatusFilter','aiSearch'])el(id).addEventListener('input',renderAIEvents);
renderAIEvents();
const r=d.reliability;
function mini(label,value){const item=add(el('historySummary'),'div','','mini');add(item,'span',label,'muted');add(item,'strong',value);}
if(!r){mini('Saved runs','—');mini('Historical pass rate','—');mini('Flaky candidates','—');el('historyHint').textContent='Historical data unavailable. Run generate-history.cjs, then analyze-reliability.cjs, then regenerate this dashboard.';for(const id of ['passTrend','healingTrend','browserReliability','selectors'])empty(el(id),'Historical data unavailable.');}
else{
  mini('Saved runs',r.runCount);mini('Historical pass rate',pct(r.passRatePercent));mini('Flaky candidates',r.possibleFlakyTests.length);
  el('historyHint').textContent=r.runCount<2?'Only one saved execution: additional distinct runs are needed to show meaningful trends.':'Metrics are aggregated across saved executions; attempts include retries.';
  const trend=Array.isArray(r.trend)?r.trend:[];
  const recent=trend.slice(-20);
  for(const run of recent){const label=fmtDate(run.startedAt);bar(el('passTrend'),label,run.passRatePercent,100,pct(run.passRatePercent));bar(el('healingTrend'),label,run.healingEvents,Math.max(1,...recent.map(x=>x.healingEvents||0)),run.healingEvents??0);}
  if(!recent.length){empty(el('passTrend'),'No saved runs.');empty(el('healingTrend'),'No saved runs.');}
  for(const b of r.browsers){bar(el('browserReliability'),b.project,b.passRatePercent,100,pct(b.passRatePercent));}
  if(!r.browsers.length)empty(el('browserReliability'),'No browser history.');
  const selectors=r.recurringSelectors.slice(0,10);for(const s of selectors){bar(el('selectors'),s.selector,s.recoveries,Math.max(1,...selectors.map(x=>x.recoveries)),s.recoveries);}
  if(!selectors.length)empty(el('selectors'),'No recorded recoveries.');
  for(const t of r.possibleFlakyTests){const row=document.createElement('tr');cell(row,t.title);cell(row,t.project);cell(row,t.passedAttempts);cell(row,t.failedAttempts);cell(row,pct(t.passRatePercent));el('flakyBody').append(row);}
}
el('flakyEmpty').hidden=!!(r?.possibleFlakyTests?.length);
function renderEvents(){const browser=el('browserFilter').value;const q=el('eventSearch').value.trim().toLowerCase();const root=el('eventsBody');root.replaceChildren();const matches=d.events.filter(e=>(!browser||e.project===browser)&&[e.primarySelector,e.recoveredSelector,e.strategy,e.test].join(' ').toLowerCase().includes(q));for(const e of matches){const row=document.createElement('tr');cell(row,fmtDate(e.timestamp));cell(row,e.project);cell(row,e.primarySelector||'',true);cell(row,e.recoveredSelector||'',true);cell(row,e.strategy||'');cell(row,e.confidence==null?'—':pct(Number(e.confidence)*100));root.append(row);}el('eventEmpty').hidden=matches.length>0;}
function renderTests(){const browser=el('testBrowserFilter').value;const q=el('testSearch').value.trim().toLowerCase();const root=el('testsBody');root.replaceChildren();const matches=d.tests.filter(t=>(!browser||t.project===browser)&&t.title.toLowerCase().includes(q));for(const t of matches){const row=document.createElement('tr');cell(row,t.title.replace(/^\\s*>\\s*/,''));cell(row,t.project);cell(row,t.status);cell(row,(t.durationMs/1000).toFixed(2)+'s');cell(row,t.retry);cell(row,t.healingCount);cell(row,t.aiCount);root.append(row);}el('testEmpty').hidden=matches.length>0;}
for(const id of ['browserFilter','eventSearch'])el(id).addEventListener('input',renderEvents);for(const id of ['testBrowserFilter','testSearch'])el(id).addEventListener('input',renderTests);renderEvents();renderTests();
</script></body></html>`;
  fs.mkdirSync(path.dirname(outputFile), {recursive: true});
  fs.writeFileSync(outputFile, html, 'utf8');
  console.log(`[AutoHeal QA] Analytics dashboard generated: ${outputFile}`);
  console.log(`[AutoHeal QA] ${data.total} attempts, ${data.healingCount} healing events, ${data.aiRecovery.totalEvaluations} AI evaluations, ${data.aiRecovery.decisionAnalytics.eventsWithAnalytics} decision analytics events, ${data.browsers.length} browser projects, ${reliability?.runCount ?? 0} historical runs`);
} catch (error) {
  console.error(`[AutoHeal QA] ${error.message}`);
  process.exitCode = 1;
}

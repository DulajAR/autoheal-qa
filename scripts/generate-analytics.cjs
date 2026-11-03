'use strict';
const fs = require('node:fs');
const path = require('node:path');
const input = path.resolve(process.argv[2] || 'reports/autoheal/summary.json');
const output = path.resolve(process.argv[3] || 'reports/autoheal/analytics.html');
if (!fs.existsSync(input)) { console.error(`Report not found: ${input}\nRun: npx playwright test`); process.exit(1); }
let report;
try { report = JSON.parse(fs.readFileSync(input, 'utf8')); }
catch (error) { console.error(`Invalid JSON: ${error.message}`); process.exit(1); }
const tests = Array.isArray(report.tests) ? report.tests : [];
const healing = report.healing || {};
const events = tests.flatMap(test => (Array.isArray(test.healingEvents) ? test.healingEvents : []).map(event => ({...event, project: String(test.project || 'unknown'), test: String(test.title || '')})));
const projects = [...new Set(tests.map(test => String(test.project || 'unknown')))];
const browserStats = projects.map(project => { const subset = tests.filter(test => String(test.project || 'unknown') === project); return { project, total: subset.length, passed: subset.filter(test => test.status === 'passed').length, failed: subset.filter(test => test.status === 'failed' || test.status === 'timedOut' || test.status === 'interrupted').length, healed: subset.reduce((sum, test) => sum + (Array.isArray(test.healingEvents) ? test.healingEvents.length : 0), 0) }; });
const data = {
  framework: String(report.framework || 'AutoHeal QA'),
  status: String(report.overallStatus || 'unknown'),
  startedAt: report.startedAt || null,
  finishedAt: report.finishedAt || null,
  total: Number(report.totalAttempts ?? tests.length),
  passed: Number(report.passedAttempts ?? 0),
  failed: Number(report.failedAttempts ?? 0),
  skipped: Number(report.skippedAttempts ?? 0),
  healingCount: Number(healing.totalEvents ?? events.length),
  healedAttempts: Number(healing.healedAttempts ?? 0),
  confidence: Number(healing.averageConfidence ?? 0),
  browserStats, events,
  tests: tests.map(t => ({title:String(t.title || ''), project:String(t.project || ''), status:String(t.status || ''), durationMs:Number(t.durationMs || 0), retry:Number(t.retry || 0), healingCount:Array.isArray(t.healingEvents) ? t.healingEvents.length : 0}))
};
const embedded = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AutoHeal QA | Analytics</title>
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;background:#090e1a;color:#e7ecf8}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 85% -10%,#19345c 0,transparent 37%),#090e1a}.shell{max-width:1250px;margin:auto;padding:40px 24px 80px}.eyebrow{font-size:12px;letter-spacing:.19em;text-transform:uppercase;color:#7bb8ff;font-weight:700}h1{font-size:clamp(30px,5vw,48px);margin:10px 0}p{color:#a6b5d1;line-height:1.55}.header{display:flex;justify-content:space-between;gap:20px;align-items:center;flex-wrap:wrap;margin-bottom:30px}.pill{border:1px solid #2b4662;background:#10243b;border-radius:999px;padding:9px 16px;color:#a7e6ca;font-weight:700}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:15px}.card,.panel{background:#111a2b;border:1px solid #25334a;border-radius:18px;padding:22px;box-shadow:0 14px 32px #0002}.card small{display:block;color:#91a5c6;font-size:13px}.number{font-size:34px;font-weight:800;margin:12px 0 3px}.green{color:#63e0aa}.blue{color:#79b6ff}.panel{margin-top:18px}h2{font-size:19px;margin:0 0 18px}.layout{display:grid;grid-template-columns:1fr 1fr;gap:18px}.bars{display:grid;gap:17px}.barrow{display:grid;grid-template-columns:105px 1fr 55px;gap:12px;align-items:center;font-size:13px}.track{height:11px;background:#25344b;border-radius:20px;overflow:hidden}.fill{height:100%;background:linear-gradient(90deg,#478de8,#6de1c3);border-radius:20px}.muted{color:#90a2bf}.tablewrap{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:680px;text-align:left}th,td{padding:13px 11px;border-bottom:1px solid #263449;font-size:13px}th{color:#8ea8ca;font-weight:600}td{color:#d6e1f5}code{font-size:12px;color:#a9d5ff;overflow-wrap:anywhere}.filters{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}select,input{background:#0b1424;color:#e8f0ff;border:1px solid #33425c;border-radius:10px;padding:10px 12px;max-width:100%}input{min-width:230px;flex:1}.tag{display:inline-block;border:1px solid #2c5b4a;background:#17352b;color:#a6efc9;border-radius:7px;padding:4px 7px}.empty{color:#9caecb;padding:20px 0}.foot{margin-top:20px;font-size:12px;color:#8296b5}@media(max-width:800px){.metrics{grid-template-columns:repeat(2,1fr)}.layout{grid-template-columns:1fr}}@media(max-width:460px){.metrics{grid-template-columns:1fr}.shell{padding:24px 14px}.barrow{grid-template-columns:75px 1fr 45px}}
</style></head><body><main class="shell"><header class="header"><div><div class="eyebrow">Quality Engineering / Analytics</div><h1>AutoHeal QA <span class="blue">Insights</span></h1><p id="period">Playwright test execution and self-healing intelligence</p></div><span class="pill" id="overall">Report loaded</span></header>
<section class="metrics"><div class="card"><small>Total test attempts</small><div class="number" id="total">—</div><small>Across all configured projects</small></div><div class="card"><small>Passed attempts</small><div class="number green" id="passed">—</div><small id="passrate">Pass rate</small></div><div class="card"><small>Healing events</small><div class="number blue" id="heal">—</div><small id="healedattempts">Recovered attempts</small></div><div class="card"><small>Average confidence</small><div class="number" id="confidence">—</div><small>Recorded healing events</small></div></section>
<section class="layout"><div class="panel"><h2>Browser execution</h2><div id="browserBars" class="bars"></div></div><div class="panel"><h2>Healing by browser</h2><div id="healingBars" class="bars"></div></div></section>
<section class="panel"><h2>Healing event history</h2><div class="filters"><select id="browserFilter" aria-label="Filter healing events by browser"><option value="">All browsers</option></select><input id="eventSearch" aria-label="Search healing events" placeholder="Search selector or strategy…"></div><div class="tablewrap"><table><thead><tr><th>Time</th><th>Browser</th><th>Original selector</th><th>Recovered selector</th><th>Strategy</th><th>Confidence</th></tr></thead><tbody id="eventsBody"></tbody></table></div><p id="eventEmpty" class="empty" hidden>No matching healing events.</p></section>
<section class="panel"><h2>Test execution details</h2><div class="filters"><select id="testBrowserFilter" aria-label="Filter tests by browser"><option value="">All browsers</option></select><input id="testSearch" aria-label="Search tests" placeholder="Search test names…"></div><div class="tablewrap"><table><thead><tr><th>Test</th><th>Browser</th><th>Status</th><th>Duration</th><th>Retries</th><th>Heals</th></tr></thead><tbody id="testsBody"></tbody></table></div><p id="testEmpty" class="empty" hidden>No matching tests.</p></section><div class="foot">Generated from reports/autoheal/summary.json. Snapshot data; refresh by rerunning the generator after tests.</div></main>
<script id="report-data" type="application/json">${embedded}</script><script>
'use strict';
const d=JSON.parse(document.getElementById('report-data').textContent);
const el=id=>document.getElementById(id);
const fmtDate=value=>value ? new Date(value).toLocaleString() : 'Unknown';
const pct=value=>Number.isFinite(value) ? (value*100).toFixed(1).replace(/\\.0$/,'')+'%' : '—';
const addText=(parent,tag,value,cls)=>{const node=document.createElement(tag);node.textContent=String(value);if(cls)node.className=cls;parent.append(node);return node;};
el('overall').textContent='Run status: '+d.status.toUpperCase();el('period').textContent=fmtDate(d.startedAt)+' — '+fmtDate(d.finishedAt);
el('total').textContent=d.total;el('passed').textContent=d.passed;el('heal').textContent=d.healingCount;el('confidence').textContent=pct(d.confidence);el('passrate').textContent=(d.total?pct(d.passed/d.total):'—')+' pass rate';el('healedattempts').textContent=d.healedAttempts+' healed attempts';
function drawBars(id,key){const root=el(id);const max=Math.max(1,...d.browserStats.map(x=>x[key]));if(!d.browserStats.length){addText(root,'p','No browser data','empty');return;}for(const b of d.browserStats){const row=addText(root,'div','','barrow');addText(row,'span',b.project);const track=addText(row,'div','','track');const fill=addText(track,'div','','fill');fill.style.width=(100*b[key]/max)+'%';addText(row,'strong',key==='total'?b.passed+'/'+b.total:b[key]);}}drawBars('browserBars','total');drawBars('healingBars','healed');
for(const p of d.browserStats){for(const id of ['browserFilter','testBrowserFilter']){const option=document.createElement('option');option.value=p.project;option.textContent=p.project;el(id).append(option);}}
function cell(row,value,code=false){const td=document.createElement('td');if(code)addText(td,'code',value);else td.textContent=String(value);row.append(td);}
function renderEvents(){const browser=el('browserFilter').value;const q=el('eventSearch').value.trim().toLowerCase();const root=el('eventsBody');root.replaceChildren();const matches=d.events.filter(e=>(!browser||e.project===browser)&&[e.primarySelector,e.recoveredSelector,e.strategy,e.test].join(' ').toLowerCase().includes(q));for(const e of matches){const row=document.createElement('tr');cell(row,fmtDate(e.timestamp));cell(row,e.project);cell(row,e.primarySelector||'',true);cell(row,e.recoveredSelector||'',true);cell(row,e.strategy||'');cell(row,pct(Number(e.confidence)));root.append(row);}el('eventEmpty').hidden=matches.length>0;}
function renderTests(){const browser=el('testBrowserFilter').value;const q=el('testSearch').value.trim().toLowerCase();const root=el('testsBody');root.replaceChildren();const matches=d.tests.filter(t=>(!browser||t.project===browser)&&t.title.toLowerCase().includes(q));for(const t of matches){const row=document.createElement('tr');cell(row,t.title.replace(/^\\s*>\\s*/,''));cell(row,t.project);cell(row,t.status);cell(row,(t.durationMs/1000).toFixed(2)+'s');cell(row,t.retry);cell(row,t.healingCount);root.append(row);}el('testEmpty').hidden=matches.length>0;}
for(const id of ['browserFilter','eventSearch'])el(id).addEventListener('input',renderEvents);for(const id of ['testBrowserFilter','testSearch'])el(id).addEventListener('input',renderTests);renderEvents();renderTests();
</script></body></html>`;
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, html, 'utf8');
console.log(`[AutoHeal QA] Analytics dashboard generated: ${output}`);
console.log(`[AutoHeal QA] ${data.total} attempts, ${data.healingCount} healing events, ${data.browserStats.length} browser projects`);

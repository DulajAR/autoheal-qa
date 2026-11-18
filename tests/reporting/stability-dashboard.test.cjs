'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const generator = path.resolve(__dirname, '../../scripts/generate-analytics.cjs');
function run(stability) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autoheal-stability-dashboard-'));
  const summary = path.join(dir, 'summary.json');
  const output = path.join(dir, 'analytics.html');
  const reliability = path.join(dir, 'reliability.json');
  const stabilityPath = path.join(dir, 'stability.json');
  fs.writeFileSync(summary, JSON.stringify({overallStatus:'passed', tests:[]}));
  if (stability !== undefined) fs.writeFileSync(stabilityPath, JSON.stringify(stability));
  const result = spawnSync(process.execPath, [generator, summary, output, reliability, stabilityPath], {encoding:'utf8'});
  const html = fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '';
  fs.rmSync(dir, {recursive:true,force:true});
  return {result, html};
}
const fixture = () => ({schemaVersion:1,runCount:4,testCount:1,flakyTestCount:0,failingTestCount:0,testsWithMissingRuns:1,coverage:{testsMissingFromProjectRuns:1,byProject:[{project:'chromium',runCount:4,testCount:1,testsPresentInEveryProjectRun:0,testsMissingFromProjectRuns:1}],comparableGroups:[{project:'chromium',runCount:3,testCount:1,runIds:['private-id']}]},tests:[{title:'safe title',project:'chromium',classification:'passing',observedRuns:3,projectRunCount:4,missingProjectRuns:1,observedCoveragePercent:75,passedRuns:3,failedRuns:0,retryRecoveredRuns:0,duration:{measuredRuns:3,averageMs:12.5},primarySelector:'#secret',privateToken:'secret-token'}]});
test('STB-001: dashboard renders stability metrics and filters',()=>{
  const {result,html}=run(fixture());
  assert.equal(result.status,0,result.stderr);
  for(const id of ['stabilityTests','stabilityCoverageBody','stabilityGroupsBody','stabilityTestsBody','stabilityClassFilter']) assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/"observedCoveragePercent":75/);
});
test('STB-002: missing optional stability report preserves existing dashboard',()=>{
  const {result,html}=run();
  assert.equal(result.status,0,result.stderr);
  assert.match(html,/"stability":null/);
  assert.match(html,/id="aiTotal"/);
});
test('STB-003: unsupported stability schema fails closed',()=>{
  const data=fixture();data.schemaVersion=999;
  const {result}=run(data);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Unsupported stability report format/);
});
test('STB-004: excludes sensitive fields and escapes malicious titles',()=>{
  const data=fixture();data.tests[0].title='</script><script>alert(1)</script>';
  const {result,html}=run(data);
  assert.equal(result.status,0,result.stderr);
  assert.doesNotMatch(html,/#secret|secret-token|private-id|<script>alert\(1\)<\/script>/);
  assert.match(html,/\\u003c\/script\\u003e/);
});

test('STB-005: generated dashboard invokes stability renderer and uses projected duration field',()=>{
  const {result,html}=run(fixture());
  assert.equal(result.status,0,result.stderr);
  assert.match(html,/function renderStabilityTests\(\)/);
  assert.match(html,/renderStabilityTests\(\);/);
  assert.match(html,/t\.averageDurationMs/);
  assert.match(html,/stabilityCoverageBody'\)\.append\(row\)/);
});

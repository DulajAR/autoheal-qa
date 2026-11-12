'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const generator = path.resolve(__dirname, '../../scripts/generate-analytics.cjs');
const id1 = '123e4567-e89b-42d3-a456-426614174000';
const id2 = '123e4567-e89b-42d3-a456-426614174001';
function base() { return {overallStatus:'passed',totalAttempts:1,passedAttempts:1,tests:[{title:'Recovery test',project:'chromium',status:'passed',healingEvents:[],aiRecoveryEvents:[]}],healing:{totalEvents:0,healedAttempts:0,averageConfidence:null}}; }
function event(id,stage,duration,timedOut=false) {return {event:'AI_RECOVERY_EVALUATED',timestamp:'2026-11-12T10:00:00Z',status:timedOut?'FAILED':'SUGGESTED',provider:'mock',evaluatedCandidates:0,recoveryId:id,diagnostics:{recoveryId:id,stage,durationMs:duration,timedOut}};}
function run(t,report) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'autoheal-obs-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const input=path.join(dir,'summary.json'), output=path.join(dir,'analytics.html');
  fs.writeFileSync(input,JSON.stringify(report));
  const result=spawnSync(process.execPath,[generator,input,output,path.join(dir,'absent-reliability.json')],{encoding:'utf8',timeout:15000});
  assert.equal(result.status,0,result.stderr);
  const html=fs.readFileSync(output,'utf8');
  const match=html.match(/<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(match,'Missing embedded data');
  return {html,data:JSON.parse(match[1])};
}
test('OBS3-001: aggregates stage, timeout and duration metrics',t=>{
  const r=base();r.tests[0].aiRecoveryEvents=[event(id1,'COMPLETED',20),event(id2,'VALIDATION',80,true)];
  const {data}=run(t,r);const o=data.aiRecovery.observability;
  assert.equal(o.eventsWithDiagnostics,2);assert.equal(o.legacyEvents,0);assert.equal(o.timedOut,1);
  assert.equal(o.averageDurationMs,50);assert.equal(o.maximumDurationMs,80);assert.equal(o.timeoutRatePercent,50);
  assert.equal(o.stages.COMPLETED,1);assert.equal(o.stages.VALIDATION,1);
});
test('OBS3-002: historical events remain supported',t=>{
  const r=base();r.tests[0].aiRecoveryEvents=[{event:'AI_RECOVERY_EVALUATED',timestamp:'2026-11-12T10:00:00Z',status:'DISABLED',provider:'mock',evaluatedCandidates:0}];
  const {data}=run(t,r);const o=data.aiRecovery.observability;
  assert.equal(o.eventsWithDiagnostics,0);assert.equal(o.legacyEvents,1);assert.equal(o.averageDurationMs,null);assert.equal(o.maximumDurationMs,null);assert.equal(o.timeoutRatePercent,null);
});
test('OBS3-003: malformed or mismatched diagnostics fail closed',t=>{
  const r=base();r.tests[0].aiRecoveryEvents=[{...event(id1,'PROVIDER',10),diagnostics:{recoveryId:id2,stage:'PROVIDER',durationMs:10,timedOut:false}},event(id2,'UNKNOWN',4),event('bad-id','COMPLETED',1)];
  const {data}=run(t,r);assert.equal(data.aiRecovery.observability.eventsWithDiagnostics,0);assert.equal(data.aiRecovery.observability.legacyEvents,3);
  assert.ok(data.aiEvents.every(e=>e.recoveryId===undefined));
});
test('OBS3-004: excludes sensitive metadata and escapes embedded HTML',t=>{
  const r=base();r.tests[0].aiRecoveryEvents=[{...event(id1,'COMPLETED',25),rawDOM:'PRIVATE_DOM_SECRET',primarySelector:'#private-selector',diagnostics:{...event(id1,'COMPLETED',25).diagnostics,secret:'PRIVATE_DIAG_SECRET'}}];
  const {data,html}=run(t,r);assert.equal(data.aiEvents[0].recoveryId,id1);
  for(const s of ['PRIVATE_DOM_SECRET','#private-selector','PRIVATE_DIAG_SECRET'])assert.equal(html.includes(s),false,`Leaked ${s}`);
  assert.deepEqual(Object.keys(data.aiEvents[0].diagnostics).sort(),['recoveryId','stage','durationMs','timedOut'].sort());
});
test('OBS3-005: dashboard preserves existing sections and adds observability controls',t=>{
  const {html}=run(t,base());
  for(const id of ['aiTotal','decisionAccepted','decisionBars','rejectionBars','historySummary','eventsBody','testsBody','recoveryObserved','recoveryTimeouts','recoveryTimeoutRate','recoveryAverage','recoveryMaximum','recoveryStageBars','recoveryHistoryBody','recoveryStageFilter','recoveryTimeoutFilter','recoverySearch'])assert.ok(html.includes(`id="${id}"`),`Missing ${id}`);
});
test('OBS3-006: zero and fractional durations remain valid',t=>{
  const r=base();r.tests[0].aiRecoveryEvents=[event(id1,'PROVIDER',0),event(id2,'COMPLETED',0.3333)];
  const {data}=run(t,r);assert.equal(data.aiRecovery.observability.averageDurationMs,0.167);assert.equal(data.aiRecovery.observability.maximumDurationMs,0.3333);
});
test('OBS3-007: timeout flag cannot be attached to success',t=>{
  const r=base();r.tests[0].aiRecoveryEvents=[{...event(id1,'COMPLETED',10),diagnostics:{recoveryId:id1,stage:'COMPLETED',durationMs:10,timedOut:true}}];
  const {data}=run(t,r);assert.equal(data.aiRecovery.observability.eventsWithDiagnostics,0);
});

import fs from 'node:fs';

const runtimePath='src/driving-runtime-base.js';
let runtime=fs.readFileSync(runtimePath,'utf8');

runtime=runtime.replace('export function jTurnTransientYawActive({','export function jTurnEntryEligible({');
if(!runtime.includes('export function jTurnEntryEligible({'))throw new Error('J-turn entry predicate rename failed');

const advanceOld=`export function advanceJTurnTransientYawState({\n  active=false,\n  bodyLongitudinalSpeed=0,\n  speedAbs=0,\n  steerAngle=0,\n  handbrake=false,\n  airborne=false,\n  onPavement=true,\n  sideslipRad=0\n}={}){\n  const entry=jTurnTransientYawActive({\n    bodyLongitudinalSpeed,speedAbs,steerAngle,handbrake,airborne,onPavement\n  });\n  if(!active)return entry;\n  if(handbrake||airborne||!onPavement)return false;\n  if(Math.abs(Number(speedAbs)||0)<2.5)return false;\n  if(Math.abs(Number(steerAngle)||0)<.05)return false;\n  const alignedExit=\n    Number(bodyLongitudinalSpeed)>2.0&&\n    Math.abs(Number(sideslipRad)||0)<.10;\n  return !alignedExit;\n}\n`;
const advanceNew=`export function jTurnExitEligible({\n  bodyLongitudinalSpeed=0,\n  speedAbs=0,\n  steerAngle=0,\n  handbrake=false,\n  airborne=false,\n  onPavement=true,\n  sideslipRad=0\n}={}){\n  if(handbrake||airborne||!onPavement)return true;\n  if(Math.abs(Number(speedAbs)||0)<2.5)return true;\n  if(Math.abs(Number(steerAngle)||0)<.05)return true;\n  return (\n    Number(bodyLongitudinalSpeed)>2.0&&\n    Math.abs(Number(sideslipRad)||0)<.10\n  );\n}\n\nexport function advanceJTurnLatchedState({\n  active=false,\n  bodyLongitudinalSpeed=0,\n  speedAbs=0,\n  steerAngle=0,\n  handbrake=false,\n  airborne=false,\n  onPavement=true,\n  sideslipRad=0\n}={}){\n  const entryEligible=jTurnEntryEligible({\n    bodyLongitudinalSpeed,speedAbs,steerAngle,handbrake,airborne,onPavement\n  });\n  if(!active)return entryEligible;\n  return !jTurnExitEligible({\n    bodyLongitudinalSpeed,speedAbs,steerAngle,handbrake,airborne,onPavement,sideslipRad\n  });\n}\n`;
if(!runtime.includes(advanceOld))throw new Error('legacy J-turn latch function anchor missing');
runtime=runtime.replace(advanceOld,advanceNew);

const runtimeReplacements=[
  ['let jTurnTransientLatched=false;','let jTurnLatchedActive=false;'],
  ['jTurnTransientLatched=advanceJTurnTransientYawState({','jTurnLatchedActive=advanceJTurnLatchedState({'],
  ['active:jTurnTransientLatched,','active:jTurnLatchedActive,'],
  ['active:jTurnTransientLatched\n    });','active:jTurnLatchedActive\n    });'],
  ['    const jTurnYawActive=jTurnTransientLatched;\n',''],
  ['if(!jTurnYawActive&&requestedLatAccel>latLimit&&requestedLatAccel>0)','if(!jTurnLatchedActive&&requestedLatAccel>latLimit&&requestedLatAccel>0)']
];
for(const [from,to] of runtimeReplacements){
  if(!runtime.includes(from))throw new Error(`runtime B2 anchor missing: ${from}`);
  runtime=runtime.replace(from,to);
}
for(const obsolete of ['jTurnTransientYawActive','advanceJTurnTransientYawState','jTurnTransientLatched','jTurnYawActive']){
  if(runtime.includes(obsolete))throw new Error(`obsolete J-turn semantic name remains in runtime: ${obsolete}`);
}
for(const required of ['jTurnEntryEligible','jTurnExitEligible','advanceJTurnLatchedState','jTurnLatchedActive']){
  if(!runtime.includes(required))throw new Error(`required explicit J-turn semantic missing: ${required}`);
}
fs.writeFileSync(runtimePath,runtime);

const r19Path='qa-grip-jturn-legacy-r19.mjs';
let r19=fs.readFileSync(r19Path,'utf8');
r19=r19.replace("import assert from 'node:assert/strict';","import assert from 'node:assert/strict';\nimport fs from 'node:fs';");
r19=r19.replace('  jTurnTransientYawActive,\n  advanceJTurnTransientYawState,','  jTurnEntryEligible,\n  jTurnExitEligible,\n  advanceJTurnLatchedState,');
r19=r19.replace('const entry=jTurnTransientYawActive({','const entryEligible=jTurnEntryEligible({');
r19=r19.replace('  active=advanceJTurnTransientYawState({','  const exitEligible=jTurnExitEligible({\n    bodyLongitudinalSpeed:bodyLong,\n    speedAbs:Math.abs(speed),\n    steerAngle,\n    handbrake:false,\n    airborne:false,\n    onPavement:true,\n    sideslipRad:sideslip\n  });\n  active=advanceJTurnLatchedState({');
r19=r19.replace('rows.push({angleDeg,bodyLong,entry,active,legacySpeed,maneuverSpeed,sideslipDeg:sideslip/DEG});','rows.push({angleDeg,bodyLong,entryEligible,exitEligible,active,legacySpeed,maneuverSpeed,sideslipDeg:sideslip/DEG});');
r19=r19.replace("assert.equal(at90.entry,false,'old instantaneous P10 gate must already be off at 90 deg');","assert.equal(at90.entryEligible,false,'J-turn entry eligibility must already be false at 90 deg');\nassert.equal(at90.exitEligible,false,'J-turn exit eligibility must remain false through the 90-degree region');");
r19=r19.replace('assert.equal(advanceJTurnTransientYawState({','assert.equal(advanceJTurnLatchedState({');
r19=r19.replace('  old_entry:r.entry,','  entry_eligible:r.entryEligible,\n  exit_eligible:r.exitEligible,');
const logAnchor="console.log('GRIP R19 LEGACY J-TURN ROTATION-WALL QA: PASS');";
if(!r19.includes(logAnchor))throw new Error('R19 log anchor missing');
r19=r19.replace(logAnchor,`const source=fs.readFileSync(new URL('./src/driving-runtime-base.js',import.meta.url),'utf8');\nassert.ok(!source.includes('jTurnTransientYawActive'),'B2 old entry-predicate name must remain removed');\nassert.ok(!source.includes('advanceJTurnTransientYawState'),'B2 old latch-state helper name must remain removed');\nassert.ok(!source.includes('jTurnYawActive'),'B2 ambiguous active alias must remain removed');\nfor(const name of ['jTurnEntryEligible','jTurnExitEligible','advanceJTurnLatchedState']){\n  assert.ok(source.includes(\`export function \${name}\`),\`B2 explicit J-turn helper missing: \${name}\`);\n}\n\n${logAnchor}`);
for(const obsolete of ['jTurnTransientYawActive','advanceJTurnTransientYawState']){
  if(r19.includes(obsolete)&&!r19.includes(`source.includes('${obsolete}')`))throw new Error(`obsolete R19 call/import remains: ${obsolete}`);
}
fs.writeFileSync(r19Path,r19);

const portlandPath='qa/V21_27_J_TURN_PORTLAND_QA.mjs';
let portland=fs.readFileSync(portlandPath,'utf8');
portland=portland.replace('  jTurnTransientYawActive,','  jTurnEntryEligible,');
portland=portland.replace('  const active=jTurnTransientYawActive({','  const entryEligible=jTurnEntryEligible({');
portland=portland.replace('  assert(active,`${mph} mph should enter transient J-turn yaw regime`);','  assert(entryEligible,`${mph} mph should be eligible to enter the J-turn transient regime`);');
if(portland.includes('jTurnTransientYawActive'))throw new Error('Portland QA still uses obsolete J-turn predicate');
fs.writeFileSync(portlandPath,portland);

console.log('CLEANUP B2 PATCH: PASS');

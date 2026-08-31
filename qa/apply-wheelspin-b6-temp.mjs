import fs from 'node:fs';

function read(file){return fs.readFileSync(file,'utf8');}
function write(file,text){fs.writeFileSync(file,text);}
function replaceOnce(text,from,to,label){
  const i=text.indexOf(from);
  if(i<0)throw new Error(`B6 patch missing ${label}`);
  if(text.indexOf(from,i+1)>=0)throw new Error(`B6 patch ${label} matched more than once`);
  return text.slice(0,i)+to+text.slice(i+from.length);
}
function replaceRe(text,re,to,label){
  const matches=[...text.matchAll(new RegExp(re.source,re.flags.includes('g')?re.flags:re.flags+'g'))];
  if(matches.length!==1)throw new Error(`B6 patch ${label} expected 1 match, got ${matches.length}`);
  return text.replace(re,to);
}

// 1) V21.29 dynamics: remove hidden traction->grip module memory and make raw/applied demand explicit.
{
  const file='src/vehicle-dynamics-v21.29.js';
  let s=read(file);
  s=replaceOnce(s,"let latestRawDriveDemandAccel=0;\nlet latestAppliedDriveAccel=0;\n\n",'', 'V21.29 hidden demand globals');
  s=replaceOnce(s,"    latestRawDriveDemandAccel=requested;\n",'', 'raw demand write');
  s=replaceOnce(s,"    latestAppliedDriveAccel=safeNumber(result?.acceleration,0);\n",'', 'applied demand write');
  s=replaceRe(
    s,
    /function publishWheelSpinTelemetry\(result,propulsionDemand,applied\)\{[\s\S]*?\n\}\n\nexport function estimateWheelGripUsage/,
    'export function estimateWheelGripUsage',
    'deprecated telemetry publisher'
  );
  s=replaceOnce(
    s,
`export function estimateWheelGripUsage(args={},out=null){
  const applied=safeNumber(args?.propulsionAccel,latestAppliedDriveAccel);
  const raw=latestRawDriveDemandAccel;
  const propulsionDemand=
    Math.abs(raw)>Math.abs(applied)+1e-6
      ?raw
      :applied;
  const result=baseEstimateWheelGripUsage({
    ...args,
    propulsionAccel:propulsionDemand
  },out);
`,
`export function estimateWheelGripUsage(args={},out=null){
  // Cleanup B6 — propulsion demand is explicit. No previous traction call may
  // affect this result. requestedPropulsionAccel is the drivetrain request
  // before traction limiting; appliedPropulsionAccel is what reached the
  // chassis after limiting/handbrake ownership.
  const applied=safeNumber(
    args?.appliedPropulsionAccel,
    safeNumber(args?.propulsionAccel,0)
  );
  const requested=safeNumber(args?.requestedPropulsionAccel,applied);
  const propulsionDemand=
    Math.abs(requested)>Math.abs(applied)+1e-6
      ?requested
      :applied;
  const result=baseEstimateWheelGripUsage({
    ...args,
    propulsionAccel:propulsionDemand
  },out);
`,
    'explicit propulsion grip inputs'
  );
  s=replaceOnce(
    s,
`  publishWheelSpinTelemetry(result,propulsionDemand,applied);
  latestRawDriveDemandAccel=0;
  latestAppliedDriveAccel=0;
  return result;
}`,
`  return result;
}`,
    'telemetry/reset tail'
  );
  write(file,s);
}

// 2) Active runtime base: carry the raw and applied propulsion values explicitly
// across the same frame into tire-utilization evaluation.
{
  const file='src/driving-runtime-base.js';
  let s=read(file);
  s=replaceOnce(
    s,
`        requestedLatAccel:tireSolverLatAccel,signedLatAccel:tireSolverSignedLatAccel,latLimit,longitudinalAccel,
        propulsionAccel:appliedBodyDriveAccel,serviceBrakeAccel:brakeForce.acceleration,
`,
`        requestedLatAccel:tireSolverLatAccel,signedLatAccel:tireSolverSignedLatAccel,latLimit,longitudinalAccel,
        requestedPropulsionAccel:requestedBodyDriveAccel,
        appliedPropulsionAccel:appliedBodyDriveAccel,
        propulsionAccel:appliedBodyDriveAccel,serviceBrakeAccel:brakeForce.acceleration,
`,
    'runtime explicit propulsion handoff'
  );
  write(file,s);
}

// 3) Persistent wheelspin: one explicit state owner instead of closure variables
// duplicated beside the clutch runtime.
{
  const file='src/driving-runtime.js';
  let s=read(file);
  s=replaceOnce(
    s,
"import {shouldAutoClutchForServiceBrake} from './physics/longitudinal-control.js';\n",
"import {shouldAutoClutchForServiceBrake} from './physics/longitudinal-control.js';\nimport {\n  createWheelspinState,\n  drivenWheelSlipLevels,\n  wheelspinDynamicGripFactor\n} from './physics/wheelspin-state.js';\nexport {drivenWheelSlipLevels,wheelspinDynamicGripFactor};\n",
    'wheelspin owner import'
  );
  s=replaceRe(
    s,
    /export function drivenWheelSlipLevels\(drivetrain='AWD',level=0\)\{[\s\S]*?\n\}\n\nexport function wheelspinDynamicGripFactor\(drivetrain='AWD',level=0,vehicleClass='passenger'\)\{[\s\S]*?\n\}\n\n/,
    '',
    'old runtime wheelspin helpers'
  );
  s=replaceOnce(s,"  let wheelspinLevel=0,wheelspinHoldSec=0;\n","  const wheelspinState=createWheelspinState();\n",'runtime hidden wheelspin state');
  s=s.replaceAll('wheelspinLevel=0;wheelspinHoldSec=0;','wheelspinState.reset();');

  s=replaceRe(
    s,
    /  const longitudinalTractionWithPersistentWheelspin=\(tractionArgs=\{\},out=null\)=>\{[\s\S]*?\n  \};\n\n  const skidMarksWithWheelspin=/,
`  const longitudinalTractionWithPersistentWheelspin=(tractionArgs={},out=null)=>{
    const result=originalLongitudinalTractionLimit
      ?originalLongitudinalTractionLimit(tractionArgs,out)
      :{acceleration:Number(tractionArgs.requestedAccel)||0,requested:Number(tractionArgs.requestedAccel)||0,limit:Infinity,limited:false};
    if(String(tractionArgs?.mode||'')!=='drive')return result;

    const drivetrain=String(tractionArgs?.vehicle?.drivetrain||'AWD');
    const vehicleClass=String(tractionArgs?.vehicle?.vehicleClass||'passenger');
    const wheelspin=wheelspinState.advance({
      dt:frameDt,
      releaseMultiplier:activeReleaseMultiplier,
      engineThrottle:requestedEngineThrottle,
      tractionResult:result,
      drivetrain,
      vehicleClass
    });

    if(wheelspin.level>.01&&result&&Number.isFinite(Number(result.acceleration))){
      const factor=wheelspin.gripFactor;
      const staticAcceleration=Number(result.staticTractionAcceleration);
      if(Number.isFinite(staticAcceleration))result.acceleration=Math.sign(result.acceleration||1)*Math.min(Math.abs(result.acceleration),Math.abs(staticAcceleration)*factor);
      else result.acceleration*=factor;
      result.runtimeWheelspinLevel=wheelspin.level;
      result.runtimeSlidingGripFactor=factor;
    }
    if(typeof globalThis!=='undefined')globalThis.WorldDriveRuntimeWheelspin={
      level:wheelspin.level,
      holdSec:wheelspin.holdSec,
      drivetrain,
      wheels:wheelspin.wheels
    };
    return result;
  };

  const skidMarksWithWheelspin=`,
    'persistent wheelspin wrapper'
  );
  s=s.replaceAll('drivenWheelSlipLevels(drivetrain,wheelspinLevel)','drivenWheelSlipLevels(drivetrain,wheelspinState.level)');
  s=s.replaceAll('wheelspinLevel>.05?Math.max(.25,Number(input.longitudinalAccel)||0):input.longitudinalAccel','wheelspinState.level>.05?Math.max(.25,Number(input.longitudinalAccel)||0):input.longitudinalAccel');
  if(/\bwheelspinLevel\b|\bwheelspinHoldSec\b/.test(s))throw new Error('B6 runtime still contains old wheelspin variables');
  write(file,s);
}

// 4) V21.30 wrapper no longer mutates a V21.29 global diagnostic. Airborne
// clearing is authoritative on the returned tire state itself.
{
  const file='src/vehicle-dynamics.js';
  let s=read(file);
  s=replaceRe(
    s,
    /\n  \/\/ V21\.29 publishes this optional diagnostic before the V21\.30 wrapper sees[\s\S]*?\n  \}\n  return result;/,
    '\n  return result;',
    'airborne telemetry global cleanup'
  );
  write(file,s);
}

// 5) Migrate clutch tests from hidden call-order coupling to explicit demand.
{
  const file='qa/V21_29_CIVIC_CLUTCH_DUMP_SLIP_QA.mjs';
  let s=read(file);
  s=replaceOnce(
    s,
`  longitudinalAccel:drive.acceleration,
  propulsionAccel:drive.acceleration,
  serviceBrakeAccel:0,
`,
`  longitudinalAccel:drive.acceleration,
  requestedPropulsionAccel:requestedDriveAccel,
  appliedPropulsionAccel:drive.acceleration,
  propulsionAccel:drive.acceleration,
  serviceBrakeAccel:0,
`,
    'Civic dump explicit demand'
  );
  write(file,s);
}
{
  const file='qa/V21_29_CIVIC_CLUTCH_WHEELSPIN_QA.mjs';
  let s=read(file);
  s=replaceOnce(
    s,
`  longitudinalAccel:limited.acceleration,
  propulsionAccel:limited.acceleration,
  serviceBrakeAccel:0,
`,
`  longitudinalAccel:limited.acceleration,
  requestedPropulsionAccel:requested,
  appliedPropulsionAccel:limited.acceleration,
  propulsionAccel:limited.acceleration,
  serviceBrakeAccel:0,
`,
    'Civic wheelspin explicit demand'
  );
  s=replaceRe(
    s,
    /\nconst telemetry=globalThis\.WorldDriveWheelSpinTelemetry;[\s\S]*?Telemetry must expose front-wheel spin'\);/,
    '',
    'Civic deprecated telemetry assertions'
  );
  write(file,s);
}

// 6) Airborne QA observes the returned authoritative tire state, not a removed global.
{
  const file='qa/V21_31_AIRBORNE_TIRE_STATE_QA.mjs';
  let s=read(file);
  s=replaceRe(
    s,
    /\n  const telemetry=globalThis\.WorldDriveWheelSpinTelemetry;[\s\S]*?\n  \}/,
    `\n  assert.equal(Number(result.requestedPropulsionAccel),0,\`${'${info.id}'}: airborne requested propulsion must be zero\`);\n  assert.equal(Number(result.appliedPropulsionAccel),0,\`${'${info.id}'}: airborne applied propulsion must be zero\`);`,
    'airborne deprecated telemetry assertions'
  );
  write(file,s);
}

// 7) Runtime wheelspin QA follows the new explicit owner instead of source markers.
{
  const file='qa/V21_29_RUNTIME_WHEELSPIN_QA.mjs';
  const s=`import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createWheelspinState,
  drivenWheelSlipLevels,
  wheelspinDynamicGripFactor,
  wheelspinHoldDurationSec
} from '../src/physics/wheelspin-state.js';

const civic=drivenWheelSlipLevels('FWD',1);
assert.equal(civic.length,4);
assert.equal(civic[0],0);
assert.equal(civic[2],0);
assert.ok(civic[1]>=.99&&civic[3]>=.99,'Civic front wheels must receive full wheelspin');

const civicGrip=wheelspinDynamicGripFactor('FWD',1,'passenger');
const wrxGrip=wheelspinDynamicGripFactor('AWD',1,'passenger');
const countachGrip=wheelspinDynamicGripFactor('RWD',1,'passenger');
assert.ok(civicGrip<wrxGrip,'FWD clutch wheelspin must lose more launch traction than AWD');
assert.ok(countachGrip<wrxGrip,'RWD clutch wheelspin must lose more launch traction than AWD');
assert.ok(Math.abs(civicGrip-.78)<.001,\`Expected Civic dynamic grip factor .78, got \${civicGrip}\`);
assert.equal(wheelspinHoldDurationSec('FWD','passenger'),.62);
assert.equal(wheelspinHoldDurationSec('RWD','passenger'),.48);
assert.equal(wheelspinHoldDurationSec('AWD','passenger'),.24);
assert.equal(wheelspinHoldDurationSec('AWD','tractor'),.18);

const state=createWheelspinState();
const seeded=state.advance({
  dt:1/60,releaseMultiplier:2.2,engineThrottle:1,
  tractionResult:{requested:10.8,limit:6,limited:true},
  drivetrain:'FWD',vehicleClass:'passenger'
});
assert.ok(seeded.level>.42,'clutch breakaway must seed persistent wheelspin');
assert.equal(seeded.holdSec,.62);
const held=state.advance({
  dt:1/60,releaseMultiplier:1,engineThrottle:1,
  tractionResult:{requested:4,limit:8,limited:false},
  drivetrain:'FWD',vehicleClass:'passenger'
});
assert.ok(held.level>0&&held.holdSec<.62,'wheelspin must persist after clutch shock');

const runtime=fs.readFileSync(new URL('../src/driving-runtime.js',import.meta.url),'utf8');
assert.match(runtime,/createWheelspinState/,'runtime must consume explicit B6 wheelspin owner');
assert.match(runtime,/skidMarksWithWheelspin/,'skidmarks must remain an observer of authoritative wheelspin');
assert.doesNotMatch(runtime,/let wheelspinLevel=0,wheelspinHoldSec=0/,'parallel runtime wheelspin variables returned');

console.log('V21.29 persistent runtime wheelspin QA passed',{
  civicGrip,wrxGrip,countachGrip,civicWheels:civic,seededLevel:seeded.level
});
`;
  write(file,s);
}

console.log('CLEANUP B6 WHEELSPIN PATCH: PASS');

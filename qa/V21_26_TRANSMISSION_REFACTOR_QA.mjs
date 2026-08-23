import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mainPath=path.join(root,'src','main.js');
const modulePath=path.join(root,'src','transmission-controller.js');

assert.ok(fs.existsSync(modulePath),'src/transmission-controller.js missing — run tools/refactor-main-transmission-v21-26.mjs first');

const main=fs.readFileSync(mainPath,'utf8').replace(/\r\n/g,'\n');
const transmission=fs.readFileSync(modulePath,'utf8').replace(/\r\n/g,'\n');

function syntaxCheck(file){
  const result=spawnSync(process.execPath,['--check',file],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,`${path.basename(file)} syntax failed:\n${result.stderr||result.stdout}`);
}
syntaxCheck(mainPath);
syntaxCheck(modulePath);

assert.match(main,/import \{ createTransmissionController \} from '\.\/transmission-controller\.js';/,'main.js missing transmission controller import');
assert.match(main,/let transmissionController=null;/,'main.js missing transmission controller facade');
assert.match(main,/const transmissionStateBridge=\{\};/,'main.js missing live transmission-state bridge');
assert.match(main,/transmissionController=createTransmissionController\(\{/,'main.js missing transmission controller initialization');
assert.match(main,/function updateTransmission\(\.\.\.args\)\{return transmissionController\.updateTransmission\(\.\.\.args\);\}/,'main.js missing narrow updateTransmission facade');
assert.match(main,/transmissionGear:\{get:\(\)=>transmissionGear,set:value=>\{transmissionGear=value;\}\}/,'main.js bridge no longer keeps transmissionGear live');
assert.match(main,/engineRpm:\{get:\(\)=>engineRpm,set:value=>\{engineRpm=value;\}\}/,'main.js bridge no longer keeps engineRpm live');
assert.match(main,/transmissionMode:\{get:\(\)=>transmissionMode,set:value=>\{transmissionMode=value;\}\}/,'main.js bridge no longer keeps transmissionMode live');

for(const pattern of [
  /function activeTransmissionProfile\(\)\{/,
  /function requestManualShift\(direction\)\{/,
  /function updateTransmission\(dt,requestedThrottle,onPavement=true\)\{/
]){
  assert.doesNotMatch(main,pattern,`main.js still owns heavy transmission behavior: ${pattern}`);
  assert.match(transmission,pattern,`transmission-controller.js missing extracted behavior: ${pattern}`);
}

for(const pattern of [
  /export function createTransmissionController\s*\(\{/,
  /state\.transmissionGear/,
  /state\.transmissionPendingGear/,
  /state\.engineRpm/,
  /state\.transmissionShifting/,
  /state\.revLimiterActive/,
  /state\.transmissionMode/,
  /getSpeed\(\)/,
  /getLongitudinalAccel\(\)/,
  /computeGearRedlineSpeeds\(/,
  /computeTransmissionState\(/,
  /powerPulse/
]){
  assert.match(transmission,pattern,`transmission-controller.js missing expected behavior: ${pattern}`);
}

const vehicleAnchor=main.indexOf('const VEHICLE=vehicleSystem.physics;');
const controllerInit=main.indexOf('transmissionController=createTransmissionController({');
const audioInit=main.indexOf('const vehicleAudio=createVehicleAudio({');
assert.ok(vehicleAnchor>=0&&controllerInit>vehicleAnchor,'transmission controller must initialize after VEHICLE exists');
assert.ok(audioInit>controllerInit,'transmission controller must initialize before vehicle audio reads its state');

const { createTransmissionController }=await import(`${pathToFileURL(modulePath).href}?qa=${Date.now()}`);
assert.equal(typeof createTransmissionController,'function','createTransmissionController export missing');

const state={
  transmissionGear:1,
  transmissionPendingGear:1,
  transmissionShiftTimer:0,
  transmissionShiftDuration:0,
  transmissionShiftStartRpm:0,
  transmissionShiftEndRpm:0,
  engineRpm:0,
  transmissionShifting:false,
  transmissionProfileKey:'',
  revLimiterActive:false,
  revLimiterPhase:0,
  transmissionMode:'manual',
  manualShiftRequest:null
};

let speed=0;
let longitudinalAccel=0;
const vehicleSystem={
  activeId:'qa-combustion',
  active:{
    audio:{
      type:'combustion',
      profile:'qa',
      idleRpm:900,
      redlineRpm:6000,
      gearRatios:[3.2,2.0],
      gearCount:2,
      shiftDuration:.12,
      downshiftDuration:.10,
      revLimiterHz:12,
      revLimiterDropRpm:220
    }
  }
};
const VEHICLE={topSpeedKmh:200};
const computeGearRedlineSpeeds=()=>[30,60];
const computeTransmissionState=(kmh,load,profile,gear)=>({
  rpm:gear===1?3000:2100,
  mechanicalRpm:gear===1?3000:2100
});
const physicsClamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const physicsSmoothstep01=value=>{
  const x=Math.max(0,Math.min(1,value));
  return x*x*(3-2*x);
};
let toastMessage='';
const controller=createTransmissionController({
  vehicleSystem,
  VEHICLE,
  computeGearRedlineSpeeds,
  computeTransmissionState,
  physicsClamp,
  physicsSmoothstep01,
  toast:value=>{toastMessage=value;},
  getSpeed:()=>speed,
  getLongitudinalAccel:()=>longitudinalAccel,
  vehicleReverseLimitMps:()=>-10,
  state
});

assert.equal(controller.activeTransmissionProfile(),vehicleSystem.active.audio,'active transmission profile changed');
assert.equal(controller.effectiveEngineRedlineRpm(vehicleSystem.active.audio,true),6000,'on-road effective redline changed');
assert.equal(controller.effectiveEngineRedlineRpm(vehicleSystem.active.audio,false),4200,'off-road effective redline changed');
assert.equal(controller.transmissionRedlineSpeedKmh(vehicleSystem.active.audio,6000),60,'mechanical top-gear redline speed changed');

controller.resetTransmissionState();
assert.equal(state.transmissionGear,1,'reset gear changed');
assert.equal(state.engineRpm,900,'combustion idle RPM reset changed');
assert.equal(state.transmissionShifting,false,'reset shifting flag changed');

controller.requestManualShift(1);
assert.equal(state.manualShiftRequest,2,'manual upshift request changed');
const shiftedThrottle=controller.updateTransmission(.016,.6,true);
assert.equal(state.transmissionPendingGear,2,'manual upshift pending gear changed');
assert.equal(state.transmissionShifting,true,'manual upshift no longer starts a timed shift');
assert.equal(shiftedThrottle,0,'positive throttle should still be cut during a started shift');
assert.equal(toastMessage,'','normal upshift unexpectedly produced a warning');

vehicleSystem.activeId='qa-ev';
vehicleSystem.active={audio:{type:'ev',profile:'ev'}};
speed=0;
state.transmissionMode='automatic';
const evThrottle=controller.updateTransmission(.016,.4,true);
assert.equal(evThrottle,.4,'EV throttle passthrough changed');
assert.equal(state.transmissionGear,0,'EV forward gear state changed');
assert.equal(state.engineRpm,0,'EV RPM state changed');
assert.equal(state.revLimiterActive,false,'EV rev limiter should remain inactive');

const mainLines=main.split('\n').length;
assert.ok(mainLines<3800,`main.js is still unexpectedly large after transmission extraction: ${mainLines} lines`);

const regression=spawnSync(process.execPath,['qa/V21_26_ENVIRONMENT_REFACTOR_QA.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(regression.status,0,`prior V21.26 refactors regressed:\n${regression.stderr||regression.stdout}`);

console.log('V21.26 TRANSMISSION REFACTOR QA: PASS');
console.log(`main.js: ${mainLines} lines; transmission-controller.js: ${transmission.split('\n').length} lines`);
console.log('automatic/manual shifting, live state bridge, effective redline and EV passthrough verified');

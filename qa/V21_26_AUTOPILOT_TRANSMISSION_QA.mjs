import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mainPath=path.join(root,'src','main.js');
const transmissionPath=path.join(root,'src','transmission-controller.js');

const main=fs.readFileSync(mainPath,'utf8').replace(/\r\n/g,'\n');
const transmission=fs.readFileSync(transmissionPath,'utf8').replace(/\r\n/g,'\n');

function syntaxCheck(file){
  const result=spawnSync(process.execPath,['--check',file],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,`${path.basename(file)} syntax failed:\n${result.stderr||result.stdout}`);
}
syntaxCheck(mainPath);
syntaxCheck(transmissionPath);

assert.match(
  main,
  /function updateTransmission\(dt,requestedThrottle,onPavement=true\)\{return transmissionController\.updateTransmission\(dt,requestedThrottle,onPavement,autopilot\);\}/,
  'main.js does not forward live autopilot state into transmission control'
);
assert.match(
  transmission,
  /function updateTransmission\(dt,requestedThrottle,onPavement=true,automaticOverride=false\)\{/,
  'transmission controller missing autopilot automatic override parameter'
);
assert.match(
  transmission,
  /const automaticShiftMode=\s*automaticOverride\|\|\s*state\.transmissionMode==='automatic';/s,
  'automatic shift mode does not include autopilot override'
);
assert.match(
  transmission,
  /if\(automaticShiftMode\)\{/,
  'automatic gear selection does not use the effective automatic mode'
);
assert.match(
  transmission,
  /if\(automaticOverride\)\{[\s\S]*?state\.manualShiftRequest=null;/,
  'autopilot override does not clear queued manual shift requests'
);

const { createTransmissionController }=await import(`${pathToFileURL(transmissionPath).href}?qa=${Date.now()}`);

const state={
  transmissionGear:1,
  transmissionPendingGear:1,
  transmissionShiftTimer:0,
  transmissionShiftDuration:0,
  transmissionShiftStartRpm:0,
  transmissionShiftEndRpm:0,
  engineRpm:900,
  transmissionShifting:false,
  transmissionProfileKey:'qa-combustion:qa',
  revLimiterActive:false,
  revLimiterPhase:0,
  transmissionMode:'manual',
  manualShiftRequest:null
};

let speed=31/3.6;
const vehicleSystem={
  activeId:'qa-combustion',
  active:{audio:{
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
  }}
};
const computeGearRedlineSpeeds=()=>[30,60];
const computeTransmissionState=(kmh,load,profile,gear)=>({
  rpm:gear===1?6000:3600,
  mechanicalRpm:gear===1?6200:3600
});
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const smooth=value=>{
  const x=clamp(value,0,1);
  return x*x*(3-2*x);
};

const controller=createTransmissionController({
  vehicleSystem,
  VEHICLE:{topSpeedKmh:200},
  computeGearRedlineSpeeds,
  computeTransmissionState,
  physicsClamp:clamp,
  physicsSmoothstep01:smooth,
  toast:()=>{},
  getSpeed:()=>speed,
  getLongitudinalAccel:()=>0,
  vehicleReverseLimitMps:()=>-10,
  state
});

// Manual driving remains manual.
let throttle=controller.updateTransmission(.016,.7,true,false);
assert.equal(state.transmissionGear,1,'manual driving unexpectedly changed gear');
assert.equal(state.transmissionShifting,false,'manual driving unexpectedly started an automatic shift');
assert.equal(state.transmissionMode,'manual','manual mode was mutated');
assert.ok(throttle>=0,'manual throttle became invalid');

// Autopilot temporarily owns gear selection without mutating the user's mode.
state.manualShiftRequest=1;
throttle=controller.updateTransmission(.016,.7,true,true);
assert.equal(state.transmissionPendingGear,2,'autopilot did not request the next automatic gear at redline speed');
assert.equal(state.transmissionShifting,true,'autopilot did not start the timed upshift');
assert.equal(throttle,0,'autopilot throttle must be cut while the shift starts');
assert.equal(state.manualShiftRequest,null,'autopilot did not clear stale manual shift request');
assert.equal(state.transmissionMode,'manual','autopilot changed the player transmission mode instead of overriding it temporarily');

controller.updateTransmission(.20,.7,true,true);
assert.equal(state.transmissionGear,2,'autopilot timed upshift did not complete');
assert.equal(state.transmissionMode,'manual','player transmission mode changed after autopilot shift completion');

console.log('V21.26 AUTOPILOT TRANSMISSION QA: PASS');
console.log('manual mode preserved; autopilot automatic gear override and timed upshift verified');

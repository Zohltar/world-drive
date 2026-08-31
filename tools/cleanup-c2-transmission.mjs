import fs from 'node:fs';

const basePath='src/transmission-controller-base.js';
const controllerPath='src/transmission-controller.js';
const staleQaPath='qa/V21_26_TRANSMISSION_REFACTOR_QA.mjs';

if(!fs.existsSync(basePath))throw new Error('C2 expected transmission-controller-base.js');
if(!fs.existsSync(controllerPath))throw new Error('C2 expected transmission-controller.js');

let base=fs.readFileSync(basePath,'utf8');
let wrapper=fs.readFileSync(controllerPath,'utf8');

function replaceExact(source,from,to,label){
  const count=source.split(from).length-1;
  if(count!==1)throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(from,to);
}

// The historical base becomes a private implementation inside the canonical
// module. Selector direction is injected explicitly instead of inferred from
// signed speed or repaired after the core update.
base=replaceExact(base,'export function createTransmissionController({','function createTransmissionCore({','rename private core');
base=replaceExact(base,'  getSpeed,\n  getLongitudinalAccel,','  getSpeed,\n  getSelector=()=>1,\n  getLongitudinalAccel,','inject selector owner');
base=replaceExact(base,'    const current=\n      Math.max(\n        1,\n        Number(state.transmissionGear)||1\n      );','    const current=normalizeForwardGear(state.transmissionGear,gearCount);','manual current gear normalization');
base=replaceExact(base,'    const gear=\n      Math.max(\n        1,\n        Math.min(\n          points.length,\n          Number(currentGear)||1\n        )\n      );','    const gear=normalizeForwardGear(currentGear,points.length);','desired current gear normalization');
base=replaceExact(base,"    if(profile.type!=='combustion'){\n      state.transmissionGear=getSpeed()<-.25?-1:0;\n      state.transmissionPendingGear=state.transmissionGear;\n      state.transmissionShiftTimer=0;\n      state.transmissionShiftDuration=0;\n      state.transmissionShifting=false;\n      state.revLimiterActive=false;\n      state.revLimiterPhase=0;\n      state.engineRpm=0;\n      return requestedThrottle;\n    }","    const selector=normalizeTransmissionSelector(getSelector());\n\n    if(profile.type!=='combustion'){\n      // C2: EV selector state is explicit too. 0 now means Neutral only; D is 1.\n      state.transmissionGear=selector;\n      state.transmissionPendingGear=selector;\n      state.transmissionShiftTimer=0;\n      state.transmissionShiftDuration=0;\n      state.transmissionShifting=false;\n      state.revLimiterActive=false;\n      state.revLimiterPhase=0;\n      state.engineRpm=0;\n      return selector===0?0:requestedThrottle;\n    }",'explicit EV selector semantics');
base=replaceExact(base,'    const effectiveRedline=\n      effectiveEngineRedlineRpm(\n        profile,\n        onPavement\n      );\n  \n    const kmh=Math.abs(getSpeed())*3.6;',"    const effectiveRedline=\n      effectiveEngineRedlineRpm(\n        profile,\n        onPavement\n      );\n\n    if(selector===0){\n      // C2: Neutral is a first-class controller state. It never enters the\n      // forward gearbox and therefore cannot be coerced to first gear by a\n      // Number(x)||1 fallback. Free-rev ownership remains in the public layer.\n      state.transmissionGear=0;\n      state.transmissionPendingGear=0;\n      state.transmissionShiftTimer=0;\n      state.transmissionShiftDuration=0;\n      state.transmissionShifting=false;\n      state.manualShiftRequest=null;\n      state.revLimiterActive=false;\n      state.revLimiterPhase=0;\n      state.engineRpm=idle;\n      return 0;\n    }\n\n    const kmh=Math.abs(getSpeed())*3.6;",'explicit combustion Neutral branch');
base=replaceExact(base,'    if(getSpeed()<-.25){','    if(selector<0){','explicit Reverse selector branch');

wrapper=replaceExact(wrapper,"import { createTransmissionController as createBaseTransmissionController } from './transmission-controller-base.js';\n",'','remove base import');
wrapper=replaceExact(wrapper,'  const base=createBaseTransmissionController({...args,getSpeed:transmissionSpeed});\n  const baseUpdateTransmission=base.updateTransmission;\n  const baseResetTransmissionState=base.resetTransmissionState;\n  const baseRequestManualShift=base.requestManualShift;','  const core=createTransmissionCore({...args,getSpeed:transmissionSpeed,getSelector:()=>selector});\n  const coreUpdateTransmission=core.updateTransmission;\n  const coreResetTransmissionState=core.resetTransmissionState;\n  const coreRequestManualShift=core.requestManualShift;','canonical private core wiring');
wrapper=wrapper.split('base.activeTransmissionProfile()').join('core.activeTransmissionProfile()');
wrapper=replaceExact(wrapper,'  function syncSelectorGear(){\n    if(selector<0){args.state.transmissionGear=-1;args.state.transmissionPendingGear=-1;}\n    else if(selector===0){args.state.transmissionGear=0;args.state.transmissionPendingGear=0;}\n    else if((Number(args.state.transmissionGear)||0)<1){args.state.transmissionGear=1;args.state.transmissionPendingGear=1;}\n    publishTransmissionSelectorGear(selector);\n    // M4.5: publish the exact authoritative gear just written to the same state\n    // consumed by the instrument cluster. This is the multiplayer source of\n    // truth, not a derived visual/reverse flag.\n    publishTransmissionNetworkGear(args.state.transmissionGear);\n  }',"  function publishAuthoritativeGear(){\n    publishTransmissionSelectorGear(selector);\n    // M4.5/C2: publish the exact gear already owned by this controller. This\n    // function observes state; it never repairs or rewrites D/N/R semantics.\n    publishTransmissionNetworkGear(args.state.transmissionGear);\n  }\n\n  function applySelectorState(){\n    if(selector<0){args.state.transmissionGear=-1;args.state.transmissionPendingGear=-1;}\n    else if(selector===0){args.state.transmissionGear=0;args.state.transmissionPendingGear=0;}\n    else if((Number(args.state.transmissionGear)||0)<1){args.state.transmissionGear=1;args.state.transmissionPendingGear=1;}\n    publishAuthoritativeGear();\n  }",'split selector writes from publication');
wrapper=wrapper.split('baseResetTransmissionState()').join('coreResetTransmissionState()');
wrapper=wrapper.split('baseRequestManualShift(dir)').join('coreRequestManualShift(dir)');
wrapper=wrapper.split('baseUpdateTransmission(dt,baseRequested,onPavement,automaticOverride)').join('coreUpdateTransmission(dt,baseRequested,onPavement,automaticOverride)');
wrapper=wrapper.split('syncSelectorGear()').join('applySelectorState()');
wrapper=replaceExact(wrapper,'      let transmitted=coreUpdateTransmission(dt,baseRequested,onPavement,automaticOverride);\n      applySelectorState();','      let transmitted=coreUpdateTransmission(dt,baseRequested,onPavement,automaticOverride);\n      publishAuthoritativeGear();','post-update publication only');
wrapper=wrapper.split('...base,').join('...core,');
wrapper=replaceExact(wrapper,'    const current=Math.max(1,Number(args.state?.transmissionGear)||1);','    const current=normalizeForwardGear(args.state?.transmissionGear);','public forward gear normalization');

const helpers=`function normalizeTransmissionSelector(value){\n  const n=Number(value);\n  return n<0?-1:n===0?0:1;\n}\n\nfunction normalizeForwardGear(value,maxGear=Infinity){\n  const n=Number(value);\n  const forward=Number.isFinite(n)&&n>=1?Math.floor(n):1;\n  const max=Number.isFinite(maxGear)?Math.max(1,Math.floor(maxGear)):Infinity;\n  return Math.min(max,forward);\n}\n\n`;
const insertion="import {publishTransmissionNetworkGear} from './transmission-network-state.js';\n\n";
wrapper=replaceExact(wrapper,insertion,insertion+helpers,'insert canonical gear helpers');

const firstFunction=wrapper.indexOf('function normalizeTransmissionSelector');
if(firstFunction<0)throw new Error('C2 helper insertion not found');
const importPrefix=wrapper.slice(0,firstFunction);
const publicBody=wrapper.slice(firstFunction);
const combined=`${importPrefix}${base}\n\n${publicBody}`.replace(/[ \t]+$/gm,'');
fs.writeFileSync(controllerPath,combined);
fs.unlinkSync(basePath);

let staleQa=fs.readFileSync(staleQaPath,'utf8');
staleQa=replaceExact(staleQa,"assert.equal(state.transmissionGear,0,'EV forward gear state changed');","assert.equal(state.transmissionGear,1,'EV forward/D must remain exact gear 1; Neutral alone is 0');",'modernize stale V21.26 EV gear expectation');
fs.writeFileSync(staleQaPath,staleQa.replace(/[ \t]+$/gm,''));

console.log('C2 transmission consolidation materialized',{removed:basePath,canonical:controllerPath,selectorContract:{reverse:-1,neutral:0,forward:'1..N'}});

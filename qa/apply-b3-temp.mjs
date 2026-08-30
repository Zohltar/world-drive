import fs from 'node:fs';

const modulePath='src/physics/maneuver-state.js';
if(fs.existsSync(modulePath))throw new Error('maneuver-state.js already exists; B3 patch is not idempotent by design');

const moduleSource=`// Maneuver-specific transient state for World Drive.\n// This module owns only J-turn latch state and rear-handbrake slip memory.\n// Tire forces, general yaw physics, momentum direction and vehicle calibration\n// remain owned by their existing physics/runtime modules.\n\nfunction smoothstep01(value){\n  const t=Math.max(0,Math.min(1,Number(value)||0));\n  return t*t*(3-2*t);\n}\n\nexport function jTurnEntryEligible({\n  bodyLongitudinalSpeed=0,\n  speedAbs=0,\n  steerAngle=0,\n  handbrake=false,\n  airborne=false,\n  onPavement=true\n}={}){\n  return !!(\n    !handbrake&&\n    !airborne&&\n    onPavement&&\n    Number(bodyLongitudinalSpeed)<-4.0&&\n    Math.abs(Number(speedAbs)||0)>=8.5&&\n    Math.abs(Number(steerAngle)||0)>=.12\n  );\n}\n\nexport function jTurnExitEligible({\n  bodyLongitudinalSpeed=0,\n  speedAbs=0,\n  steerAngle=0,\n  handbrake=false,\n  airborne=false,\n  onPavement=true,\n  sideslipRad=0\n}={}){\n  if(handbrake||airborne||!onPavement)return true;\n  if(Math.abs(Number(speedAbs)||0)<2.5)return true;\n  if(Math.abs(Number(steerAngle)||0)<.05)return true;\n  return (\n    Number(bodyLongitudinalSpeed)>2.0&&\n    Math.abs(Number(sideslipRad)||0)<.10\n  );\n}\n\nexport function advanceJTurnLatchedState({\n  active=false,\n  bodyLongitudinalSpeed=0,\n  speedAbs=0,\n  steerAngle=0,\n  handbrake=false,\n  airborne=false,\n  onPavement=true,\n  sideslipRad=0\n}={}){\n  const entryEligible=jTurnEntryEligible({\n    bodyLongitudinalSpeed,speedAbs,steerAngle,handbrake,airborne,onPavement\n  });\n  if(!active)return entryEligible;\n  return !jTurnExitEligible({\n    bodyLongitudinalSpeed,speedAbs,steerAngle,handbrake,airborne,onPavement,sideslipRad\n  });\n}\n\nexport function jTurnTransientSteeringSpeed({speed=0,fallbackSpeed=0,active=false}={}){\n  if(!active)return Number(fallbackSpeed)||0;\n  // A latched J-turn entered in reverse. Preserve that steering travel sign\n  // through 90 degrees instead of letting cos(beta) drive it to zero and then\n  // reverse the bicycle yaw target while the chassis is still rotating.\n  return -Math.abs(Number(speed)||0);\n}\n\nexport function handbrakeLateralEffectForSpeed(speedAbs=0){\n  return smoothstep01((Math.max(0,Number(speedAbs)||0)-2.5)/6.5);\n}\n\n// Grip R1 — wheel lock/recovery is continuous, not tied to the button edge.\nexport function advanceHandbrakeRearSlipState({previous=0,handbrake=false,airborne=false,speedAbs=0,sideslipRad=0,dt=0}={}){\n  const prev=Math.max(0,Math.min(1,Number(previous)||0));\n  const step=Math.min(.05,Math.max(0,Number(dt)||0));\n  if(step<=0)return prev;\n  if(airborne)return prev*Math.exp(-step/.08);\n  const speed=Math.max(0,Math.abs(Number(speedAbs)||0));\n  const beta=Math.min(Math.PI*.5,Math.abs(Number(sideslipRad)||0));\n  const target=handbrake?handbrakeLateralEffectForSpeed(speed):0;\n  const engageTau=.045;\n  const speedT=smoothstep01(speed/30);\n  const sideslipT=smoothstep01(beta/.55);\n  const releaseTau=.11+.09*speedT+.24*sideslipT;\n  const tau=target>prev?engageTau:releaseTau;\n  return prev+(target-prev)*(1-Math.exp(-step/Math.max(.02,tau)));\n}\n\nexport function createManeuverState({rearHandbrakeSlipState=0,jTurnLatchedActive=false}={}){\n  let rearSlip=Math.max(0,Math.min(1,Number(rearHandbrakeSlipState)||0));\n  let jTurnActive=!!jTurnLatchedActive;\n  return {\n    advanceRearHandbrakeSlip(args={}){\n      rearSlip=advanceHandbrakeRearSlipState({previous:rearSlip,...args});\n      return rearSlip;\n    },\n    advanceJTurn(args={}){\n      jTurnActive=advanceJTurnLatchedState({active:jTurnActive,...args});\n      return jTurnActive;\n    },\n    snapshot(){\n      return {rearHandbrakeSlipState:rearSlip,jTurnLatchedActive:jTurnActive};\n    }\n  };\n}\n`;
fs.writeFileSync(modulePath,moduleSource);

const runtimePath='src/driving-runtime-base.js';
let runtime=fs.readFileSync(runtimePath,'utf8');
const importAnchor="import { serviceBrakeAcceleration, brakeWouldCrossZero } from './physics/longitudinal-control.js';\n";
if(!runtime.includes(importAnchor))throw new Error('runtime import anchor missing');
runtime=runtime.replace(importAnchor,importAnchor+`import {\n  createManeuverState,\n  jTurnTransientSteeringSpeed\n} from './physics/maneuver-state.js';\n`);

const jStart=runtime.indexOf('export function jTurnEntryEligible({');
const rearAxleStart=runtime.indexOf('export function rearAxleStaticLoadFraction',jStart);
if(jStart<0||rearAxleStart<0)throw new Error('J-turn/handbrake transient extraction anchors missing');
runtime=runtime.slice(0,jStart)+runtime.slice(rearAxleStart);

const hbStart=runtime.indexOf('export function advanceHandbrakeRearSlipState({');
const landingStart=runtime.indexOf('export function landingSideslipGripSeed',hbStart);
if(hbStart<0||landingStart<0)throw new Error('rear handbrake slip extraction anchors missing');
runtime=runtime.slice(0,hbStart)+runtime.slice(landingStart);

const stateOld='  let wasAirborne=false;\n  let rearHandbrakeSlipState=0;\n  let jTurnLatchedActive=false;';
const stateNew='  let wasAirborne=false;\n  const maneuverState=createManeuverState();';
if(!runtime.includes(stateOld))throw new Error('runtime maneuver state declaration anchor missing');
runtime=runtime.replace(stateOld,stateNew);

const rearOld='    rearHandbrakeSlipState=advanceHandbrakeRearSlipState({previous:rearHandbrakeSlipState,handbrake:hand,airborne:airborneNow,speedAbs,sideslipRad:currentSideslip,dt});';
const rearNew='    const rearHandbrakeSlipState=maneuverState.advanceRearHandbrakeSlip({handbrake:hand,airborne:airborneNow,speedAbs,sideslipRad:currentSideslip,dt});';
if(!runtime.includes(rearOld))throw new Error('runtime rear slip update anchor missing');
runtime=runtime.replace(rearOld,rearNew);

const jOld=`    jTurnLatchedActive=advanceJTurnLatchedState({\n      active:jTurnLatchedActive,\n      bodyLongitudinalSpeed,\n      speedAbs,\n      steerAngle,\n      handbrake:hand,\n      airborne:airborneNow,\n      onPavement,\n      sideslipRad:currentSideslip\n    });`;
const jNew=`    const jTurnLatchedActive=maneuverState.advanceJTurn({\n      bodyLongitudinalSpeed,\n      speedAbs,\n      steerAngle,\n      handbrake:hand,\n      airborne:airborneNow,\n      onPavement,\n      sideslipRad:currentSideslip\n    });`;
if(!runtime.includes(jOld))throw new Error('runtime J-turn state update anchor missing');
runtime=runtime.replace(jOld,jNew);

for(const obsolete of [
  'export function jTurnEntryEligible',
  'export function jTurnExitEligible',
  'export function advanceJTurnLatchedState',
  'export function jTurnTransientSteeringSpeed',
  'export function handbrakeLateralEffectForSpeed',
  'export function advanceHandbrakeRearSlipState',
  'let rearHandbrakeSlipState=0',
  'let jTurnLatchedActive=false'
]){
  if(runtime.includes(obsolete))throw new Error(`runtime still owns maneuver state/helper: ${obsolete}`);
}
if(!runtime.includes('const maneuverState=createManeuverState();'))throw new Error('runtime maneuver-state owner missing');
fs.writeFileSync(runtimePath,runtime);

const r19Path='qa-grip-jturn-legacy-r19.mjs';
let r19=fs.readFileSync(r19Path,'utf8');
const r19Import=`import {\n  bodyRelativeLongitudinalSpeed,\n  bodyRelativeSteeringSpeed,\n  travelAxisSideslip,\n  jTurnEntryEligible,\n  jTurnExitEligible,\n  advanceJTurnLatchedState,\n  jTurnTransientSteeringSpeed\n} from './src/driving-runtime-base.js';`;
const r19ImportNew=`import {\n  bodyRelativeLongitudinalSpeed,\n  bodyRelativeSteeringSpeed,\n  travelAxisSideslip\n} from './src/driving-runtime-base.js';\nimport {\n  jTurnEntryEligible,\n  jTurnExitEligible,\n  advanceJTurnLatchedState,\n  jTurnTransientSteeringSpeed\n} from './src/physics/maneuver-state.js';`;
if(!r19.includes(r19Import))throw new Error('R19 import anchor missing');
r19=r19.replace(r19Import,r19ImportNew);
const sourceOld=`const source=fs.readFileSync(new URL('./src/driving-runtime-base.js',import.meta.url),'utf8');\nassert.ok(!source.includes('jTurnTransientYawActive'),'B2 old entry-predicate name must remain removed');\nassert.ok(!source.includes('advanceJTurnTransientYawState'),'B2 old latch-state helper name must remain removed');\nassert.ok(!source.includes('jTurnYawActive'),'B2 ambiguous active alias must remain removed');\nfor(const name of ['jTurnEntryEligible','jTurnExitEligible','advanceJTurnLatchedState']){\n  assert.ok(source.includes(\`export function \${name}\`),\`B2 explicit J-turn helper missing: \${name}\`);\n}`;
const sourceNew=`const runtimeSource=fs.readFileSync(new URL('./src/driving-runtime-base.js',import.meta.url),'utf8');\nconst maneuverSource=fs.readFileSync(new URL('./src/physics/maneuver-state.js',import.meta.url),'utf8');\nassert.ok(!runtimeSource.includes('jTurnTransientYawActive'),'B2 old entry-predicate name must remain removed');\nassert.ok(!runtimeSource.includes('advanceJTurnTransientYawState'),'B2 old latch-state helper name must remain removed');\nassert.ok(!runtimeSource.includes('jTurnYawActive'),'B2 ambiguous active alias must remain removed');\nfor(const name of ['jTurnEntryEligible','jTurnExitEligible','advanceJTurnLatchedState']){\n  assert.ok(maneuverSource.includes(\`export function \${name}\`),\`B3 maneuver helper missing from maneuver-state: \${name}\`);\n  assert.ok(!runtimeSource.includes(\`export function \${name}\`),\`B3 runtime must not own maneuver helper: \${name}\`);\n}\nassert.ok(runtimeSource.includes('createManeuverState'),'B3 runtime must consume maneuver-state owner');`;
if(!r19.includes(sourceOld))throw new Error('R19 B2 source ownership anchor missing');
r19=r19.replace(sourceOld,sourceNew);
fs.writeFileSync(r19Path,r19);

const portlandPath='qa/V21_27_J_TURN_PORTLAND_QA.mjs';
let portland=fs.readFileSync(portlandPath,'utf8');
const portlandImport=`import {\n  jTurnEntryEligible,\n  bodyRelativeLongitudinalSpeed\n} from '../src/driving-runtime.js';`;
const portlandNew=`import {bodyRelativeLongitudinalSpeed} from '../src/driving-runtime.js';\nimport {jTurnEntryEligible} from '../src/physics/maneuver-state.js';`;
if(!portland.includes(portlandImport))throw new Error('Portland maneuver import anchor missing');
portland=portland.replace(portlandImport,portlandNew);
fs.writeFileSync(portlandPath,portland);

const r1Path='qa-grip-handbrake-r1.mjs';
let r1=fs.readFileSync(r1Path,'utf8');
const r1Import='import {advanceHandbrakeRearSlipState,rearContactPatchSideslip} from "./src/driving-runtime-base.js";';
const r1New='import {rearContactPatchSideslip} from "./src/driving-runtime-base.js";\nimport {advanceHandbrakeRearSlipState} from "./src/physics/maneuver-state.js";';
if(!r1.includes(r1Import))throw new Error('R1 handbrake import anchor missing');
r1=r1.replace(r1Import,r1New);
fs.writeFileSync(r1Path,r1);

const lowPath='qa/V21_27_HANDRAKE_180_LOW_SPEED_QA.mjs';
let low=fs.readFileSync(lowPath,'utf8');
const lowImport="import { fileURLToPath } from 'node:url';\n";
if(!low.includes(lowImport))throw new Error('low-speed QA import anchor missing');
low=low.replace(lowImport,lowImport+"import {handbrakeLateralEffectForSpeed} from '../src/physics/maneuver-state.js';\n");
const lowDestructure=`const {\n  bodyRelativeLongitudinalSpeed,\n  bodyRelativeSteeringSpeed,\n  handbrakeLateralEffectForSpeed\n}=await import(\`${'${pathToFileURL(runtimePath).href}'}?qa=${'${Date.now()}'}\`);`;
const lowDestructureNew=`const {\n  bodyRelativeLongitudinalSpeed,\n  bodyRelativeSteeringSpeed\n}=await import(\`${'${pathToFileURL(runtimePath).href}'}?qa=${'${Date.now()}'}\`);`;
if(!low.includes(lowDestructure))throw new Error('low-speed QA runtime destructure anchor missing');
low=low.replace(lowDestructure,lowDestructureNew);
fs.writeFileSync(lowPath,low);

const b3qa=`import assert from 'node:assert/strict';\nimport fs from 'node:fs';\nimport {\n  createManeuverState,\n  advanceHandbrakeRearSlipState,\n  advanceJTurnLatchedState,\n  jTurnEntryEligible,\n  jTurnExitEligible\n} from './src/physics/maneuver-state.js';\n\nconst state=createManeuverState();\nconst hb1=state.advanceRearHandbrakeSlip({handbrake:true,airborne:false,speedAbs:20,sideslipRad:.2,dt:1/60});\nconst hb1Expected=advanceHandbrakeRearSlipState({previous:0,handbrake:true,airborne:false,speedAbs:20,sideslipRad:.2,dt:1/60});\nassert.equal(hb1,hb1Expected,'controller must preserve first rear-handbrake slip step exactly');\nconst hb2=state.advanceRearHandbrakeSlip({handbrake:false,airborne:false,speedAbs:20,sideslipRad:.45,dt:1/60});\nconst hb2Expected=advanceHandbrakeRearSlipState({previous:hb1Expected,handbrake:false,airborne:false,speedAbs:20,sideslipRad:.45,dt:1/60});\nassert.equal(hb2,hb2Expected,'controller must preserve rear-handbrake release step exactly');\n\nconst entryArgs={bodyLongitudinalSpeed:-12,speedAbs:12,steerAngle:.30,handbrake:false,airborne:false,onPavement:true,sideslipRad:0};\nassert.equal(jTurnEntryEligible(entryArgs),true,'reverse J-turn entry sample must remain eligible');\nconst latched1=state.advanceJTurn(entryArgs);\nassert.equal(latched1,advanceJTurnLatchedState({active:false,...entryArgs}),'controller J-turn entry must match pure transition');\nconst sidewaysArgs={bodyLongitudinalSpeed:0,speedAbs:12,steerAngle:.30,handbrake:false,airborne:false,onPavement:true,sideslipRad:Math.PI/2};\nassert.equal(jTurnEntryEligible(sidewaysArgs),false,'90-degree region must not be a new entry');\nassert.equal(jTurnExitEligible(sidewaysArgs),false,'90-degree region must not be an exit');\nconst latched90=state.advanceJTurn(sidewaysArgs);\nassert.equal(latched90,true,'controller must preserve J-turn latch through 90 degrees');\nconst exitArgs={bodyLongitudinalSpeed:12,speedAbs:12,steerAngle:.30,handbrake:false,airborne:false,onPavement:true,sideslipRad:.02};\nassert.equal(jTurnExitEligible(exitArgs),true,'forward realignment sample must be an exit');\nassert.equal(state.advanceJTurn(exitArgs),false,'controller must release J-turn latch on the same exit condition');\nconst snap=state.snapshot();\nassert.equal(snap.rearHandbrakeSlipState,hb2,'snapshot must expose owned rear-handbrake slip state');\nassert.equal(snap.jTurnLatchedActive,false,'snapshot must expose owned J-turn latch state');\n\nconst runtimeSource=fs.readFileSync('src/driving-runtime-base.js','utf8');\nconst maneuverSource=fs.readFileSync('src/physics/maneuver-state.js','utf8');\nassert.ok(runtimeSource.includes("from './physics/maneuver-state.js'"),'runtime must import maneuver-state module');\nassert.ok(runtimeSource.includes('const maneuverState=createManeuverState();'),'runtime must instantiate one maneuver-state owner');\nassert.ok(!runtimeSource.includes('let rearHandbrakeSlipState=0'),'runtime must not own rear handbrake slip memory');\nassert.ok(!runtimeSource.includes('let jTurnLatchedActive=false'),'runtime must not own J-turn latch memory');\nfor(const name of ['jTurnEntryEligible','jTurnExitEligible','advanceJTurnLatchedState','advanceHandbrakeRearSlipState']){\n  assert.ok(!runtimeSource.includes(\`export function \${name}\`),\`runtime must not define maneuver helper \${name}\`);\n  assert.ok(maneuverSource.includes(\`export function \${name}\`),\`maneuver-state must define helper \${name}\`);\n}\nfor(const forbidden of ['estimateWheelGripUsage','createPerWheelShadowSolver','lateralDynamicsEnvelope','yawResponseRate','driftTireForceAuthority']){\n  assert.ok(!maneuverSource.includes(forbidden),\`maneuver-state must not take ownership of tire/yaw physics: \${forbidden}\`);\n}\nconsole.log('CLEANUP B3 MANEUVER STATE OWNERSHIP QA: PASS',{hb1,hb2,latched90});\n`;
fs.writeFileSync('qa-maneuver-state-b3.mjs',b3qa);

console.log('CLEANUP B3 PATCH: PASS');

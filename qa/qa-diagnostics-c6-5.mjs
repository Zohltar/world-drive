import fs from 'node:fs';
import {ensureWorldDriveDiagnostics} from '../src/diagnostics.js';

function expect(value,message){if(!value)throw new Error(message);}
function positions(source,needle){
  const out=[];let i=0;
  while((i=source.indexOf(needle,i))!==-1){out.push(i);i+=needle.length;}
  return out;
}

const rootA=ensureWorldDriveDiagnostics();
const physicsA=rootA.physics;
const rootB=ensureWorldDriveDiagnostics();
expect(rootA===rootB,'C6.5 must preserve stable diagnostics-root identity');
expect(physicsA===rootB.physics,'C6.5 must preserve stable physics-category identity');

const source=fs.readFileSync(new URL('../src/transmission-controller.js',import.meta.url),'utf8');
expect(source.includes("import {ensureWorldDriveDiagnostics} from './diagnostics.js';"),
  'transmission controller must import canonical diagnostics root');
expect(!source.includes('WorldDriveEngineInput'),'legacy engine-input global remains');
expect(source.includes("const engineInputDiagnostics=typeof window==='undefined'?null:ensureWorldDriveDiagnostics().physics;"),
  'controller must bind canonical physics diagnostics once while preserving non-browser behavior');
expect(source.includes('function publishEngineInput(diagnostics,{throttle=0,clutchHeld=false}={}){'),
  'engine-input publisher boundary changed');
expect(source.includes('diagnostics.engineInput={throttle:clamp01(Math.max(0,Number(throttle)||0)),clutchHeld:!!clutchHeld};'),
  'engine-input payload or normalization changed');
expect(positions(source,'diagnostics.engineInput=').length===1,
  'canonical engine-input telemetry must have one writer');
expect(positions(source,'publishEngineInput(engineInputDiagnostics,{').length===2,
  'engine-input telemetry publication count changed');

const resetStart=source.indexOf('function resetTransmissionState(){');
const resetPublish=source.indexOf('publishEngineInput(engineInputDiagnostics,{throttle:0,clutchHeld:false});',resetStart);
const coreReset=source.indexOf('const result=coreResetTransmissionState();',resetStart);
expect(resetStart>=0&&resetPublish>resetStart&&coreReset>resetPublish,
  'reset engine-input publication timing changed');

const updateStart=source.indexOf('updateTransmission(dt,requestedThrottle');
const coreUpdate=source.indexOf('let transmitted=coreUpdateTransmission(',updateStart);
const gearPublish=source.indexOf('publishAuthoritativeGear();',coreUpdate);
const updatePublish=source.indexOf('publishEngineInput(engineInputDiagnostics,{throttle:combustion?engineThrottle:0,clutchHeld:effectiveClutch});',gearPublish);
const freeRevBranch=source.indexOf('if(combustion&&effectiveClutch){',updatePublish);
expect(updateStart>=0&&coreUpdate>updateStart&&gearPublish>coreUpdate&&updatePublish>gearPublish&&freeRevBranch>updatePublish,
  'normal engine-input publication moved relative to authoritative transmission/free-rev work');

const helperStart=source.indexOf('function publishEngineInput(');
const helperEnd=source.indexOf('\n}',helperStart)+2;
const helper=source.slice(helperStart,helperEnd);
expect(helper.includes("if(!diagnostics)return;"),'non-browser/null diagnostics guard missing');
for(const forbidden of ['transmissionGear','engineRpm','selector','publishTransmission','clutchShock','wheelspin']){
  expect(!helper.includes(forbidden),`engine-input telemetry acquired behavior authority: ${forbidden}`);
}

const assignmentRefs=positions(source,'engineInputDiagnostics.engineInput');
expect(assignmentRefs.length===0,'transmission logic must not read canonical engine-input telemetry');

console.log('CLEANUP C6.5 ENGINE INPUT DIAGNOSTICS QA: PASS',{
  stableRoot:true,
  stablePhysicsCategory:true,
  legacyGlobalRemoved:true,
  exactPayload:['throttle','clutchHeld'],
  resetTimingPreserved:true,
  updateTimingPreserved:true,
  observerOnly:true
});
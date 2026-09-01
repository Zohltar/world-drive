import fs from 'node:fs';
import {ensureWorldDriveDiagnostics} from '../src/diagnostics.js';

function expect(value,message){if(!value)throw new Error(message);}
function same(actual,expected,message){
  const a=JSON.stringify(actual),e=JSON.stringify(expected);
  if(a!==e)throw new Error(`${message}\nactual: ${a}\nexpected: ${e}`);
}

const rootBefore=ensureWorldDriveDiagnostics();
const presentationBefore=rootBefore.presentation;
const mod=await import(`../src/vehicles/deferred-glb-system.js?c6_2=${Date.now()}`);
const rootAfter=ensureWorldDriveDiagnostics();

expect(rootAfter===rootBefore,'C6.2 must preserve stable diagnostics-root identity');
expect(rootAfter.presentation===presentationBefore,'C6.2 must preserve stable presentation-category identity');
expect(rootAfter.presentation.localAuthored===mod.readLocalAuthoredPresentationState,
  'canonical presentation diagnostic must use the existing exported snapshot function');
expect(!Object.prototype.hasOwnProperty.call(globalThis,'__WORLD_DRIVE_LOCAL_AUTHORED_PRESENTATION__'),
  'legacy local-authored presentation global should no longer be installed');

mod.resetLocalAuthoredPresentationState();
same(rootAfter.presentation.localAuthored(),{
  sequence:0,source:null,braking:false,reversing:false,nightLevel:null
},'canonical snapshot must preserve reset semantics');

expect(mod.publishLocalAuthoredPresentationState('id4',{braking:1,reversing:0,nightLevel:1.4})===1,
  'publish sequence semantics changed');
same(mod.readLocalAuthoredPresentationState(),{
  sequence:1,source:'id4',braking:true,reversing:false,nightLevel:1
},'exported authored presentation snapshot changed');
same(rootAfter.presentation.localAuthored(),mod.readLocalAuthoredPresentationState(),
  'canonical diagnostic snapshot must equal exported snapshot');

expect(mod.clearLocalAuthoredPresentationState('wrong-source')===false,
  'source-guarded clear semantics changed');
expect(mod.clearLocalAuthoredPresentationState('id4')===true,
  'matching-source clear semantics changed');
same(rootAfter.presentation.localAuthored(),{
  sequence:2,source:null,braking:false,reversing:false,nightLevel:null
},'canonical snapshot must preserve clear semantics');

mod.resetLocalAuthoredPresentationState();
let implementationUpdates=0;
const deferred=mod.createDeferredGlbSystem({
  label:'qa-authored',
  options:{},
  loadFactory:async()=>()=>({
    setActive(){},
    update(){implementationUpdates++;}
  })
});
deferred.setActive(true);
deferred.update(1/60,{braking:true,reversing:true,nightLevel:.42});
same(rootAfter.presentation.localAuthored(),{
  sequence:1,source:'qa-authored',braking:true,reversing:true,nightLevel:.42
},'deferred active-update publication changed');
deferred.setActive(false);
same(rootAfter.presentation.localAuthored(),{
  sequence:2,source:null,braking:false,reversing:false,nightLevel:null
},'deferred deactivation clear changed');
expect(implementationUpdates===0,'async fallback window behavior unexpectedly changed');

const source=fs.readFileSync(new URL('../src/vehicles/deferred-glb-system.js',import.meta.url),'utf8');
expect(source.includes("import {ensureWorldDriveDiagnostics} from '../diagnostics.js';"),
  'deferred GLB system must consume canonical diagnostics root');
expect(source.includes('presentationDiagnostics.localAuthored=readLocalAuthoredPresentationState;'),
  'canonical local-authored presentation binding missing');
expect(!source.includes('__WORLD_DRIVE_LOCAL_AUTHORED_PRESENTATION__'),
  'independent legacy presentation global writer remains in source');
expect(source.includes("if(method==='update'&&requestedActive){")&&
       source.includes('publishLocalAuthoredPresentationState(label,args[1]||{});'),
  'active authored presentation capture path changed');

console.log('CLEANUP C6.2 PRESENTATION DIAGNOSTICS QA: PASS',{
  stableRoot:true,
  stablePresentationCategory:true,
  exactSnapshotFunction:true,
  legacyGlobalRemoved:true,
  exportedStateSemantics:true,
  deferredCaptureSemantics:true
});
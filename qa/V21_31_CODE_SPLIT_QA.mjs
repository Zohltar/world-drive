import assert from 'node:assert/strict';
import fs from 'node:fs';

const main=fs.readFileSync('src/main.js','utf8');
const entries=fs.readFileSync('src/vehicles/vehicle-glb-entries.js','utf8');
const registry=fs.readFileSync('src/vehicles/vehicle-authored-registry.js','utf8');
const facade=fs.readFileSync('src/vehicles/deferred-glb-system.js','utf8');

const vehicles=[
  ['countach','countach-glb.js'],
  ['id4','id4-glb.js'],
  ['wrx','wrx-glb.js'],
  ['civic','civic-glb.js'],
  ['sonata','sonata-glb.js'],
  ['f1','f1-glb.js'],
  ['i3','i3-glb.js']
];

for(const [name,moduleFile] of vehicles){
  assert(!main.includes(`from './${moduleFile}'`),`${name}: heavy GLB module still statically imported by main`);
  assert(!main.includes(`from './vehicles/models/${moduleFile}'`),`${name}: moved heavy GLB module is statically imported by main`);
  assert(registry.includes(`import('./models/${moduleFile}')`),`${name}: authored registry missing canonical dynamic model import`);
}

assert(main.includes("from './vehicles/vehicle-glb-entries.js'"),'main: deferred vehicle entry module not used from canonical vehicles path');
assert(entries.includes("from './vehicle-authored-registry.js'"),'entries: canonical authored registry not used');
assert(entries.includes('createDeferredGlbSystem'),'entries: deferred GLB facade not used');
assert(facade.includes("method==='setActive'"),'facade: activation gate missing');
assert(facade.includes('ensureImplementation()'),'facade: async implementation load missing');
assert(facade.includes("method==='isDriverCameraMode'"),'facade: Countach camera fallback missing');

console.log('V21.31 PASSENGER MODULE CODE SPLIT QA: PASS',{
  source:'vehicles/vehicle-authored-registry',
  modelsPath:'vehicles/models',
  deferredFacade:true,
  vehicles:vehicles.map(([name])=>name)
});

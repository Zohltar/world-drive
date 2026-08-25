import assert from 'node:assert/strict';
import fs from 'node:fs';

const main=fs.readFileSync('src/main.js','utf8');
const entries=fs.readFileSync('src/vehicle-glb-entries.js','utf8');
const facade=fs.readFileSync('src/deferred-glb-system.js','utf8');

for(const name of ['countach','id4','wrx','civic','sonata','f1','i3']){
  assert(!main.includes(`from './${name}-glb.js'`),`${name}: heavy GLB module still statically imported by main`);
  assert(entries.includes(`import('./${name}-glb.js')`),`${name}: missing dynamic module import`);
}

assert(main.includes("from './vehicle-glb-entries.js'"),'main: deferred vehicle entry module not used');
assert(facade.includes("method==='setActive'"),'facade: activation gate missing');
assert(facade.includes('ensureImplementation()'),'facade: async implementation load missing');
assert(facade.includes("method==='isDriverCameraMode'"),'facade: Countach camera fallback missing');

console.log('V21.31 PASSENGER MODULE CODE SPLIT QA: PASS');

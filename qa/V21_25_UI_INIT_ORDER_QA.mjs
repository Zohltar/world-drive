import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const mainPath=path.join(root,'src','main.js');

assert.equal(fs.existsSync(mainPath),true,'src/main.js missing');
const main=fs.readFileSync(mainPath,'utf8');

assert.match(main,/let v21MenuSystem=null;/,'lazy v21MenuSystem declaration missing');
assert.doesNotMatch(main,/const v21MenuSystem\s*=/,'v21MenuSystem must not be a late const initialization');

const declarationIndex=main.indexOf('let v21MenuSystem=null;');
const earlySyncIndex=main.indexOf('syncVehicleSpeedCapability();');
assert.ok(declarationIndex>=0,'v21MenuSystem declaration not found');
assert.ok(earlySyncIndex>=0,'early speed capability sync not found');
assert.ok(
  declarationIndex<earlySyncIndex,
  `v21MenuSystem must be initialized before syncVehicleSpeedCapability() (${declarationIndex} !< ${earlySyncIndex})`
);

for(const pattern of [
  /function ensureV21MenuSystem\(\)/,
  /function syncV21RuntimeControls\(\)\{v21MenuSystem\?\.syncRuntimeControls\(\);\}/,
  /function syncV21VehicleInfo\(\)\{v21MenuSystem\?\.syncVehicleInfo\(\);\}/,
  /function applyV21DisplayVisibility\(\)\{v21MenuSystem\?\.applyDisplayVisibility\(\);\}/
]){
  assert.match(main,pattern,`lazy menu facade missing: ${pattern}`);
}

const syntax=spawnSync(process.execPath,['--check',mainPath],{cwd:root,encoding:'utf8'});
assert.equal(syntax.status,0,syntax.stderr||syntax.stdout||'main.js syntax check failed');

console.log('V21.25 UI INIT ORDER QA: PASS');
console.log('v21MenuSystem declaration precedes early vehicle/UI synchronization.');

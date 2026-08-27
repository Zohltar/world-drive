import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const wrapperPath=path.join(root,'src','scenery-renderer-p933.js');
const entryPath=path.join(root,'src','scenery-renderer.js');
const startupPath=path.join(root,'src','startup-ui.js');

function read(file){return fs.readFileSync(file,'utf8');}
function expect(condition,message){if(!condition)throw new Error(message);}
function syntax(file){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0)throw new Error(`Syntax check failed for ${path.basename(file)}\n${result.stderr||result.stdout}`);
}

syntax(wrapperPath);syntax(entryPath);syntax(startupPath);
const wrapper=read(wrapperPath),entry=read(entryPath),startup=read(startupPath);

expect(entry.includes("from './scenery-renderer-p933.js'"),'scenery entry must route through P9.33');
for(const marker of [
  'DEFAULT_INITIAL_CHUNKS=14',
  'DEFAULT_TIMEOUT_MS=5500',
  'active>=target',
  '__WORLD_DRIVE_P933_FOREST_READY__',
  'routeGeneration++',
  'startupForestStatus'
])expect(wrapper.includes(marker),`P9.33 wrapper marker missing: ${marker}`);

expect(startup.includes("await waitForForest({minChunks:14,timeoutMs:5500,pollMs:35})"),'startup must await P9.33 forest coverage');
expect(startup.includes('PRÉPARATION DE LA FORÊT…'),'startup should expose forest preparation state');
expect(startup.indexOf('await waitForForest')<startup.indexOf('onStartVehicle(selectedVehicle)'),'forest gate must happen before gameplay starts');

console.log('PASS P9.33 startup forest gate QA');
console.log('  - startup waits for 14 active forest chunks');
console.log('  - gate has a 5.5 s safety timeout');
console.log('  - route generation invalidates stale readiness waits');

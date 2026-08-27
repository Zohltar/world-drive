import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const wrapperPath=path.join(root,'src','scenery-renderer-p933.js');
const entryPath=path.join(root,'src','scenery-renderer.js');
const startupPath=path.join(root,'src','startup-ui.js');
const streamerPath=path.join(root,'src','forest-chunk-streamer-p929-wrapper.js');

function read(file){return fs.readFileSync(file,'utf8');}
function expect(condition,message){if(!condition)throw new Error(message);}
function syntax(file){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0)throw new Error(`Syntax check failed for ${path.basename(file)}\n${result.stderr||result.stdout}`);
}

syntax(wrapperPath);syntax(entryPath);syntax(startupPath);syntax(streamerPath);
const wrapper=read(wrapperPath),entry=read(entryPath),startup=read(startupPath),streamer=read(streamerPath);

expect(entry.includes("from './scenery-renderer-p933.js'"),'scenery entry must route through P9.33/P9.34 gate');
for(const marker of [
  'DEFAULT_INITIAL_CHUNKS=14',
  'DEFAULT_FRONT_CHUNKS=7',
  'DEFAULT_TIMEOUT_MS=5500',
  'coverage.front>=frontTarget',
  'directionalCoverage',
  '__WORLD_DRIVE_P934_FOREST_READY__',
  'routeGeneration++',
  'startupForestStatus'
])expect(wrapper.includes(marker),`P9.34 startup gate marker missing: ${marker}`);

for(const marker of [
  'STARTUP_DIRECTION_SEED_M=180',
  'seedStartupRouteDirection',
  'Math.sin(nr.angle)',
  'Math.cos(nr.angle)',
  "startupMode:'p934-startup-route-seed'",
  "observerMode:'p931-ahead-priority'",
  '__WORLD_DRIVE_P934_FOREST__'
])expect(streamer.includes(marker),`P9.34 route seed marker missing: ${marker}`);

expect(startup.includes('minChunks:14'),'startup must await total P9.34 forest coverage');
expect(startup.includes('minFrontChunks:7'),'startup must await forward P9.34 forest coverage');
expect(startup.includes('PRÉPARATION DE LA FORÊT DEVANT…'),'startup should expose forward forest preparation state');
expect(startup.indexOf('await waitForForest')<startup.indexOf('onStartVehicle(selectedVehicle)'),'forest gate must happen before gameplay starts');
expect(streamer.includes("legacyObserverMode:'p929-direct-last-slice'"),'P9.34 must retain P9.29 diagnostics compatibility');

console.log('PASS P9.33/P9.34 startup forest gate QA');
console.log('  - startup route heading seeds ahead priority before movement');
console.log('  - startup waits for 14 active chunks including 7 forward chunks');
console.log('  - P9.31/P9.29 diagnostics compatibility remains intact');

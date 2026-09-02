import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const wrapperPath=path.join(root,'src','scenery','scenery-renderer-p933.js');
const basePath=path.join(root,'src','scenery','scenery-renderer-p9.js');
const entryPath=path.join(root,'src','scenery-renderer.js');
const startupPath=path.join(root,'src','startup-ui.js');
const streamerPath=path.join(root,'src','forest-chunk-streamer.js');
const implPath=path.join(root,'src','forest-chunk-streamer-core.js');

function read(file){return fs.readFileSync(file,'utf8');}
function expect(condition,message){if(!condition)throw new Error(message);}
function syntax(file){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0)throw new Error(`Syntax check failed for ${path.basename(file)}\n${result.stderr||result.stdout}`);
}

for(const file of [wrapperPath,basePath,entryPath,startupPath,streamerPath,implPath])syntax(file);
const wrapper=read(wrapperPath),base=read(basePath),entry=read(entryPath),startup=read(startupPath),streamer=read(streamerPath),impl=read(implPath);

expect(entry.includes("from './scenery/scenery-renderer-p933.js'"),'scenery entry must route through nested P9.33+ gate');
expect(wrapper.includes("from './scenery-renderer-p9.js'"),'nested P9.33+ gate must compose nested P9 scenery renderer');
expect(base.includes("from '../forest-chunk-streamer.js'"),'nested P9 scenery renderer must preserve the canonical root forest boundary');
for(const marker of [
  'DEFAULT_INITIAL_CHUNKS=14',
  'DEFAULT_FRONT_CHUNKS=8',
  'DEFAULT_FRONT_LEAD=2',
  'coverage.front>=frontTarget',
  'coverage.front>=coverage.rear+frontLead',
  'directionalCoverage',
  '__WORLD_DRIVE_P935_FOREST_READY__',
  'routeGeneration++',
  'startupForestStatus'
])expect(wrapper.includes(marker),`P9.35 startup gate marker missing: ${marker}`);

for(const marker of [
  'STARTUP_DIRECTION_SEED_M=180',
  'seedStartupRouteDirection',
  'Math.sin(nr.angle)',
  'Math.cos(nr.angle)',
  "startupMode:'p934-startup-route-seed'",
  "observerMode:'p931-ahead-priority'",
  '__WORLD_DRIVE_P934_FOREST__'
])expect(streamer.includes(marker),`P9.34 route seed marker missing: ${marker}`);

for(const marker of [
  'directionalNearPriority:true',
  'signedForwardDistance',
  'nearForwardBonus:.72',
  'nearRearPenalty:1.05',
  'forward*perf.nearForwardBonus',
  '-forward*perf.nearRearPenalty'
])expect(impl.includes(marker),`P9.35 near-ring priority marker missing: ${marker}`);

expect(startup.includes('minChunks:14'),'startup must await total P9.35 forest coverage');
expect(startup.includes('minFrontChunks:8'),'startup must await stronger forward P9.35 coverage');
expect(startup.includes('minFrontLead:2'),'startup must require a forward majority');
expect(startup.includes('PRÉPARATION DE LA FORÊT DEVANT…'),'startup should expose forward forest preparation state');
expect(startup.indexOf('await waitForForest')<startup.indexOf('onStartVehicle(selectedVehicle)'),'forest gate must happen before gameplay starts');
expect(streamer.includes("legacyObserverMode:'p929-direct-last-slice'"),'P9.35 must retain P9.29 diagnostics compatibility');

console.log('PASS P9.33/P9.34/P9.35 startup forest gate QA');
console.log('  - scenery implementations are nested behind the stable root entry');
console.log('  - startup route heading seeds ahead priority before movement');
console.log('  - protected near ring now prefers route-forward chunks');
console.log('  - startup requires 14 chunks, 8 forward, and a +2 forward lead');
console.log('  - P9.31/P9.29 diagnostics compatibility remains intact');

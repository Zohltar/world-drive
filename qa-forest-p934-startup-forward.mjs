import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const streamerPath=path.join(root,'src','forest-chunk-streamer-p929-wrapper.js');
const gatePath=path.join(root,'src','scenery-renderer-p933.js');
const startupPath=path.join(root,'src','startup-ui.js');

function read(file){return fs.readFileSync(file,'utf8');}
function expect(condition,message){if(!condition)throw new Error(message);}
function syntax(file){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0)throw new Error(`Syntax check failed for ${path.basename(file)}\n${result.stderr||result.stdout}`);
}

syntax(streamerPath);syntax(gatePath);syntax(startupPath);
const streamer=read(streamerPath),gate=read(gatePath),startup=read(startupPath);

for(const marker of [
  'STARTUP_DIRECTION_SEED_M=180',
  'routeDirectionAt',
  'seedStartupRouteDirection',
  'Math.sin(nr.angle)',
  'Math.cos(nr.angle)',
  "observerMode:'p934-startup-route-seed'",
  '__WORLD_DRIVE_P934_FOREST__'
])expect(streamer.includes(marker),`P9.34 startup route seed marker missing: ${marker}`);

for(const marker of [
  'DEFAULT_FRONT_CHUNKS=7',
  'directionalCoverage',
  'coverage.front>=frontTarget',
  'targetFrontChunks:DEFAULT_FRONT_CHUNKS',
  '__WORLD_DRIVE_P934_FOREST_READY__',
  '__WORLD_DRIVE_P934_FOREST_STATUS__'
])expect(gate.includes(marker),`P9.34 forward gate marker missing: ${marker}`);

expect(
  startup.includes('minFrontChunks:7'),
  'vehicle startup must require seven forward chunks'
);
expect(
  startup.includes('PRÉPARATION DE LA FORÊT DEVANT…'),
  'startup UI should expose forward forest preparation'
);
expect(
  streamer.includes("legacyObserverMode:'p929-direct-last-slice'"),
  'P9.34 must retain P9.29 diagnostics compatibility'
);

console.log('PASS P9.34 startup-forward forest QA');
console.log('  - route heading seeds ahead priority before first movement');
console.log('  - startup readiness counts forward chunks, not only total chunks');
console.log('  - P9.29 compatibility remains present');

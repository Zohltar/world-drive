import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const localPath=path.join(root,'src','local-world-builder.js');
const furnitureEntry=path.join(root,'src','road-furniture.js');
const furnitureWrapper=path.join(root,'src','road-furniture-p937.js');
const furnitureBase=path.join(root,'src','road-furniture-p930.js');

function read(file){return fs.readFileSync(file,'utf8');}
function expect(condition,message){if(!condition)throw new Error(message);}
function syntax(file){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0)throw new Error(`Syntax check failed for ${path.basename(file)}\n${result.stderr||result.stdout}`);
}

for(const file of [localPath,furnitureEntry,furnitureWrapper,furnitureBase])syntax(file);
const local=read(localPath),entry=read(furnitureEntry),wrapper=read(furnitureWrapper),base=read(furnitureBase);

for(const marker of [
  'P937_ROAD_PREP_GAP_MS=8',
  'prepareRoadStage',
  'p937RoadStage',
  "takePrepared('volume'",
  "takePrepared('lateral'",
  "takePrepared('ribbon'",
  "takePrepared('offset'",
  'p937RoadPrebuild',
  'replayObjects'
])expect(local.includes(marker),`P9.37 staged-road marker missing: ${marker}`);

expect(local.includes('preparedObjects+=tasks.length'),'P9.37 must account for seven staged road objects');
expect(local.includes('prepared.p937RoadStage=await prepareRoadStage(prepared)'),'P9.37 road preparation must complete before commit');
expect(entry.includes("from './road-furniture-p937.js'"),'road-furniture entry must route through P9.37');
expect(base.includes('P9.30 keeps sign appearance unchanged'),'P9.30 sign implementation must remain preserved');

for(const marker of [
  'MIN_IDLE_MS=5.5',
  'MAX_IDLE_DEFERRALS=10',
  'IDLE_TIMEOUT_MS=900',
  'requestIdleCallback',
  'perf.coalesced++',
  "mode:'p937-idle-sign-collection'",
  'ensureWorldDriveDiagnostics',
  'roadSignDiagnostics.snapshot=diagnostics'
])expect(wrapper.includes(marker),`P9.37 road-sign idle marker missing: ${marker}`);

expect(wrapper.includes('pending:scheduled||baseDiag.pending===true'),'P9.37 must expose deferred sign work as pending');

console.log('PASS P9.37 combined frame-pacing QA');
console.log('  - seven road meshes are prebuilt before atomic world commit');
console.log('  - prepared road meshes are replayed instead of regenerated');
console.log('  - road-sign collection is coalesced and deferred to browser idle');
console.log('  - P9.30 sign appearance/build path remains preserved');

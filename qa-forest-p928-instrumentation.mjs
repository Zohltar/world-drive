import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const entryPath=path.join(root,'src','forest-chunk-streamer.js');
const p928Path=path.join(root,'src','forest-chunk-streamer-p928.js');
const p912Path=path.join(root,'src','forest-chunk-streamer-p912.js');

function read(file){return fs.readFileSync(file,'utf8');}
function expect(condition,message){if(!condition)throw new Error(message);}
function checkSyntax(file){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0){
    throw new Error(`Syntax check failed for ${path.basename(file)}\n${result.stderr||result.stdout}`);
  }
}

const entry=read(entryPath);
const p928=read(p928Path);
const p912=read(p912Path);

checkSyntax(entryPath);
checkSyntax(p928Path);
checkSyntax(p912Path);

expect(
  entry.includes("from './forest-chunk-streamer-p928.js'"),
  'Forest entry point must route through P9.28 diagnostics wrapper'
);
expect(
  p928.includes("from './forest-chunk-streamer-p912.js'"),
  'P9.28 must delegate to the proven P9.12 streamer'
);
expect(
  p912.includes('Foret P9.12 — transition-safe dense forest streamer'),
  'P9.12 authoritative streamer marker missing'
);

for(const marker of [
  '__WORLD_DRIVE_P928_FOREST__',
  'WorldDriveFramePacing',
  'hitchCorrelation',
  'hitchesCorrelated',
  'maxCommitSliceMs',
  'maxChunkCompletionSliceMs',
  "reason:'stream-report'"
]){
  expect(p928.includes(marker),`P9.28 telemetry marker missing: ${marker}`);
}

expect(
  !p928.includes('FOREST_STREAMING_POLICY'),
  'P9.28 diagnostics wrapper must not own or alter forest policy'
);
expect(
  !p928.includes('candidatesPerCell')&&
  !p928.includes('densityNearFullDistance')&&
  !p928.includes('farDensityFraction'),
  'P9.28 diagnostics wrapper must not alter density/LOD policy'
);

console.log('PASS P9.28 forest instrumentation QA');
console.log('  - P9.12 remains authoritative');
console.log('  - P9.28 exports frame-pacing + forest telemetry');
console.log('  - hitch correlation is diagnostics-only');

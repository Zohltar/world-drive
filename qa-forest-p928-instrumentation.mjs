import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const entryPath=path.join(root,'src','forest-chunk-streamer.js');
const p928Path=path.join(root,'src','forest-chunk-streamer-p928.js');
const p912Path=path.join(root,'src','forest-chunk-streamer-p912.js');
const coordinatorPath=path.join(root,'src','streaming-coordinator.js');

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
const coordinator=read(coordinatorPath);

for(const file of [entryPath,p928Path,p912Path,coordinatorPath])checkSyntax(file);

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
  '__WORLD_DRIVE_P928_RECORD_HITCH__',
  "observerMode:'direct-hitch-hook'",
  'WorldDriveFramePacing',
  'hitchCorrelation',
  'hitchesCorrelated',
  'maxCommitSliceMs',
  'maxChunkCompletionSliceMs',
  "queueSample('stream-report')"
]){
  expect(p928.includes(marker),`P9.28 telemetry marker missing: ${marker}`);
}

expect(
  coordinator.includes('__WORLD_DRIVE_P928_RECORD_HITCH__'),
  'Streaming coordinator must feed P9.28 only when a real gameplay hitch is detected'
);
expect(
  coordinator.includes('rawFrameMs>20'),
  'P9.28 hitch feed must remain on the existing >20 ms hitch threshold'
);
expect(
  !p928.includes('setInterval('),
  'P9.28 must never poll diagnostics on a periodic main-thread interval'
);
expect(
  !p928.includes('P928_CORRELATION_POLL_MS'),
  'Legacy 80 ms polling instrumentation must remain removed'
);
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

console.log('PASS P9.28.1 forest instrumentation QA');
console.log('  - P9.12 remains authoritative');
console.log('  - no periodic diagnostics polling');
console.log('  - hitch correlation is fed only by real >20 ms gameplay hitches');

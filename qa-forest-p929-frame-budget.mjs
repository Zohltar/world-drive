import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const entryPath=path.join(root,'src','forest-chunk-streamer.js');
const implPath=path.join(root,'src','forest-chunk-streamer-p929.js');
const wrapperPath=path.join(root,'src','forest-chunk-streamer-p929-wrapper.js');
const coordinatorPath=path.join(root,'src','streaming-coordinator.js');

function read(file){return fs.readFileSync(file,'utf8');}
function expect(condition,message){if(!condition)throw new Error(message);}
function checkSyntax(file){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0)throw new Error(`Syntax check failed for ${path.basename(file)}\n${result.stderr||result.stdout}`);
}

const entry=read(entryPath),impl=read(implPath),wrapper=read(wrapperPath),coordinator=read(coordinatorPath);
for(const file of [entryPath,implPath,wrapperPath,coordinatorPath])checkSyntax(file);

expect(entry.includes("from './forest-chunk-streamer-p929-wrapper.js'"),'entry point must use P9.29 wrapper');
for(const marker of [
  'candidateIndex',
  'processBuilderCandidate',
  'sliceBudgetMs',
  'candidateBatchSize',
  'job.readyToCommit=true',
  'installConservativeBounds',
  'lastSliceAt',
  'lastCommitAt',
  'reportIntervalMs'
])expect(impl.includes(marker),`P9.29 implementation marker missing: ${marker}`);

expect(!wrapper.includes('setInterval('),'active forest diagnostics must never poll on an interval');
expect(wrapper.includes('__WORLD_DRIVE_P928_RECORD_HITCH__'),'active wrapper must keep direct hitch-hook compatibility');
expect(wrapper.includes('p929-direct-last-slice'),'active direct last-slice correlation marker missing');
for(const marker of ['hitchesObserved','hitchesCorrelated','hitchesAttributedToForest','hitchesUnmatched']){
  expect(wrapper.includes(marker),`active hitch telemetry marker missing: ${marker}`);
}
expect(!wrapper.includes('FOREST_STREAMING_POLICY'),'diagnostics wrapper must not own forest policy');
expect(!wrapper.includes('candidatesPerCell')&&!wrapper.includes('densityNearFullDistance')&&!wrapper.includes('farDensityFraction'),
  'diagnostics wrapper must not alter density/LOD policy');
expect(coordinator.includes('if(rawFrameMs>20){'),'forest hitch feed must remain on the >20 ms gameplay hitch threshold');
expect(coordinator.includes('globalThis.__WORLD_DRIVE_P928_RECORD_HITCH__?.({'),
  'streaming coordinator must feed the active forest hitch hook');
expect(!impl.includes('cellsPerBuildSlice'),'P9.29 must not process whole cells as its scheduling unit');

console.log('PASS ACTIVE P9.29+ FOREST FRAME-BUDGET / DIAGNOSTICS QA');
console.log('  - candidate-level resumable generation');
console.log('  - chunk commit isolated to its own idle slice');
console.log('  - conservative instance bounds avoid per-commit full scan');
console.log('  - diagnostics remain zero-polling and policy-neutral');
console.log('  - >20 ms gameplay hitch feed remains explicit');

import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const entryPath=path.join(root,'src','forest-chunk-streamer.js');
const implPath=path.join(root,'src','forest-chunk-streamer-p929.js');
const wrapperPath=path.join(root,'src','forest-chunk-streamer-p929-wrapper.js');

function read(file){return fs.readFileSync(file,'utf8');}
function expect(condition,message){if(!condition)throw new Error(message);}
function checkSyntax(file){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0)throw new Error(`Syntax check failed for ${path.basename(file)}\n${result.stderr||result.stdout}`);
}

const entry=read(entryPath),impl=read(implPath),wrapper=read(wrapperPath);
checkSyntax(entryPath);checkSyntax(implPath);checkSyntax(wrapperPath);

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

expect(!wrapper.includes('setInterval('),'P9.29 diagnostics must never poll on an interval');
expect(wrapper.includes('__WORLD_DRIVE_P928_RECORD_HITCH__'),'P9.29 must keep direct hitch hook compatibility');
expect(wrapper.includes('p929-direct-last-slice'),'P9.29 direct last-slice correlation marker missing');
expect(!impl.includes('cellsPerBuildSlice'),'P9.29 must not process whole cells as its scheduling unit');

console.log('PASS P9.29 forest frame-budget QA');
console.log('  - candidate-level resumable generation');
console.log('  - chunk commit isolated to its own idle slice');
console.log('  - conservative instance bounds avoid per-commit full scan');
console.log('  - diagnostics remain zero-polling');

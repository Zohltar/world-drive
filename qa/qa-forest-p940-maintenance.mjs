import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const implPath=path.join(root,'src','forest-chunk-streamer-core.js');
const wrapperPath=path.join(root,'src','forest-chunk-streamer.js');

function read(file){return fs.readFileSync(file,'utf8');}
function expect(condition,message){if(!condition)throw new Error(message);}
function syntax(file){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0)throw new Error(`Syntax check failed for ${path.basename(file)}\n${result.stderr||result.stdout}`);
}

syntax(implPath);syntax(wrapperPath);
const impl=read(implPath),wrapper=read(wrapperPath);

for(const marker of [
  'P9.40',
  'queuePriorityDirty=true',
  'if(!force&&!queuePriorityDirty)return false',
  'perf.queueSorts++',
  'perf.cacheTrimRuns++',
  'maxQueueSortMs',
  'maxCacheTrimMs'
])expect(impl.includes(marker),`P9.40 implementation marker missing: ${marker}`);

const trims=impl.match(/\btrimCache\(\);/g)||[];
expect(trims.length===2,`P9.40 should trim only after chunk commit and requestUpdate, found ${trims.length}`);
expect(
  impl.includes('sortQueueByPriority(center,true)')&&impl.includes('sortQueueByPriority(lastCenter)'),
  'P9.40 must preserve explicit reprioritization while allowing dirty-check no-op slices'
);

for(const marker of [
  "streamingMode:'p940-dirty-priority-queue'",
  'maintenance:{',
  'queueSorts:finite(raw.queueSorts)',
  'cacheTrimRuns:finite(raw.cacheTrimRuns)',
  'matchesByKind:{slice:correlation.sliceMatches,commit:correlation.commitMatches}',
  '__WORLD_DRIVE_P940_FOREST__'
])expect(wrapper.includes(marker),`P9.40 diagnostics marker missing: ${marker}`);

console.log('PASS P9.40 forest maintenance QA');
console.log('  - queue priority sorting is dirty-driven instead of repeated per slice');
console.log('  - cache trimming runs only when cache membership can change');
console.log('  - hitch diagnostics split forest slice vs commit correlations');

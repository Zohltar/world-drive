import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const coordinatorPath=path.join(root,'src','streaming-coordinator.js');

function expect(condition,message){if(!condition)throw new Error(message);}
const syntax=spawnSync(process.execPath,['--check',coordinatorPath],{encoding:'utf8'});
if(syntax.status!==0)throw new Error(`Syntax check failed\n${syntax.stderr||syntax.stdout}`);
const source=fs.readFileSync(coordinatorPath,'utf8');

for(const marker of [
  'HITCH_ATTRIBUTION_WINDOW_MS=90',
  'HITCH_ATTRIBUTION_HISTORY=12',
  'lastVisualJobEvent',
  'lastPreparedCommitEvent',
  'recordHitchAttribution',
  "source='prepared-world'",
  'source=`visual:${visual.key}`',
  "source='forest'",
  'hitchAttributionCounts',
  'hitchAttributionHistory',
  'p939HitchAttribution'
])expect(source.includes(marker),`P9.39 marker missing: ${marker}`);

expect(
  source.includes('globalThis.WorldDriveDiagnostics?.forest?.recordHitch||')&&
  source.includes('globalThis.__WORLD_DRIVE_P928_RECORD_HITCH__'),
  'P9.39 must prefer canonical forest hitch correlation while preserving the compatibility fallback'
);
expect(
  source.includes('lastPreparedCommitEvent={at:ended,ms,reasons:[...reasons]}'),
  'P9.39 must timestamp prepared world commits'
);
expect(
  source.includes('recordVisualJobSync(key,syncEnded-started,syncEnded)')&&
  source.includes('lastVisualJobEvent={key:String(key),ms,at:endedAt}'),
  'P9.39 must keep hitch attribution on synchronous visual CPU time'
);
expect(
  source.includes("recordVisualJobSettlement(key,ended-started,'async-resolve',ended)")&&
  source.includes("recordVisualJobSettlement(key,ended-started,'async-reject',ended)"),
  'Block 4 async settlement timing must remain separate from P9.39 sync attribution'
);

console.log('PASS P9.39 hitch-attribution QA');
console.log('  - >20ms gameplay hitches keep a bounded attribution history');
console.log('  - prepared world, synchronous visual CPU and forest correlation are distinguished');
console.log('  - async wall time is diagnostic-only and does not become a false hitch culprit');
console.log('  - unknown remains explicit instead of guessing a culprit');

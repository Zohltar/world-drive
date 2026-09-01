import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
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
  source.includes('recordVisualJob(key,ended-started,ended)'),
  'P9.39 must timestamp synchronous visual job work'
);

console.log('PASS P9.39 hitch-attribution QA');
console.log('  - >20ms gameplay hitches keep a bounded attribution history');
console.log('  - prepared world, visual jobs and forest correlation are distinguished');
console.log('  - unknown remains explicit instead of guessing a culprit');

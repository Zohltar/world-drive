import assert from 'node:assert/strict';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const qaDir=path.join(root,'qa');
const tests=[
  'qa-r8-current-ownership.mjs',
  'qa-streaming-p917-load-smoothing.mjs',
  'qa-streaming-p918-loading.mjs',
  'qa-streaming-p919-elevation.mjs',
  'qa-streaming-p920-world-phases.mjs',
  'qa-streaming-p921-terrain-reuse.mjs',
  'qa-streaming-p922-road-transition.mjs',
  'qa-forest-route-cache-reset.mjs',
  'qa-streaming-p923-prepared-refresh.mjs',
  'qa-streaming-p923-scheduler.mjs',
  'qa-streaming-p924-frame-budget.mjs',
  'qa-streaming-p925-scenery-and-prep.mjs',
  'qa-streaming-p926-horizon.mjs',
  'qa-streaming-p927-road-transition.mjs'
];

for(const test of tests){
  const result=spawnSync(process.execPath,[path.join(qaDir,test)],{
    cwd:root,
    encoding:'utf8',
    env:process.env
  });
  if(result.stdout)process.stdout.write(result.stdout);
  if(result.stderr)process.stderr.write(result.stderr);
  assert.equal(result.status,0,`R8 baseline failed: ${test}`);
}

console.log(`R8 STREAMING BASELINE: PASS (${tests.length}/${tests.length})`);

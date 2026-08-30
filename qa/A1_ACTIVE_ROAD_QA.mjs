import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const tests=[
  'qa/V21_31_ROAD_SMOOTHING_QA.mjs',
  'qa/V21_31_SUPERELEVATION_QA.mjs',
  'qa/V21_31_SUPERELEVATION_ENVELOPE_QA.mjs',
  'qa/V21_31_LEGACY_TERRAIN_AUTHORITY_QA.mjs'
];
for(const file of tests){
  const result=spawnSync(process.execPath,[file],{cwd:ROOT,encoding:'utf8'});
  process.stdout.write(result.stdout||'');
  process.stderr.write(result.stderr||'');
  assert.equal(result.status,0,`${file} failed`);
}
console.log('A1 ACTIVE ROAD QA MIGRATION: PASS');

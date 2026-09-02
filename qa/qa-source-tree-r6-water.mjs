import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const src=path.join(root,'src');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const exists=relative=>fs.existsSync(path.join(root,relative));

for(const relative of [
  'src/water-data.js',
  'src/water-renderer.js',
  'src/water/water-data.js',
  'src/water/water-renderer.js',
  'src/forest-water-assets.js'
]){
  assert.equal(exists(relative),true,`${relative} missing`);
}

const dataFacade=read('src/water-data.js');
const rendererFacade=read('src/water-renderer.js');
const renderer=read('src/water/water-renderer.js');
const main=read('src/main.js');

assert.match(
  dataFacade,
  /export \{createWaterDataService\} from '\.\/water\/water-data\.js';/,
  'water-data root facade must target src/water/water-data.js'
);
assert.match(
  rendererFacade,
  /export \{createWaterRenderer\} from '\.\/water\/water-renderer\.js';/,
  'water-renderer root facade must target src/water/water-renderer.js'
);

assert.match(
  renderer,
  /from '\.\.\/forest-water-assets\.js';/,
  'nested water renderer must keep the shared forest/water asset boundary at src/forest-water-assets.js'
);
assert.equal(
  exists('src/water/forest-water-assets.js'),
  false,
  'R6.4 must not duplicate/move the shared forest-water asset service into water'
);

assert.match(main,/from '\.\/water-data\.js'/,
  'main.js must keep the stable root water-data import');
assert.match(main,/from '\.\/water-renderer\.js'/,
  'main.js must keep the stable root water-renderer import');
assert.doesNotMatch(main,/from '\.\/water\/water-data\.js'/,
  'main.js must not bypass the root water-data facade');
assert.doesNotMatch(main,/from '\.\/water\/water-renderer\.js'/,
  'main.js must not bypass the root water-renderer facade');

const dataImplementation=read('src/water/water-data.js');
assert.match(dataImplementation,/export function createWaterDataService\s*\(/,
  'nested water data implementation lost createWaterDataService export');
assert.match(renderer,/export function createWaterRenderer\s*\(/,
  'nested water renderer implementation lost createWaterRenderer export');

console.log('R6 water source-tree boundary QA: PASS');

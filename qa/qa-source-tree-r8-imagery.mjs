import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8').replace(/\r\n/g,'\n');
const exists=relative=>fs.existsSync(path.join(root,relative));

const publicOwner='src/imagery.js';
const nestedImplementation='src/imagery/imagery-p913.js';
const legacyRoot='src/imagery-p913.js';

assert.equal(exists(publicOwner),true,'R8.2 public imagery owner must remain at src/imagery.js');
assert.equal(exists(nestedImplementation),true,'R8.2 nested P9.13 imagery implementation missing');
assert.equal(exists(legacyRoot),false,'R8.2 legacy root imagery-p913.js must be absent');

const facade=read(publicOwner);
const implementation=read(nestedImplementation);
const main=read('src/main.js');

assert.match(facade,/from '\.\/imagery\/imagery-p913\.js'/,
  'root imagery owner must import the nested P9.13 implementation');
assert.match(facade,/export function createImageryService\s*\(/,
  'root imagery owner must remain the current public factory');
assert.match(main,/from '\.\/imagery\.js'/,
  'main runtime must continue importing the stable root imagery owner');
assert.doesNotMatch(main,/imagery\/imagery-p913\.js/,
  'main runtime must not bypass the root imagery owner');

// Preserve the historical P9.13 runtime engine byte-for-byte in responsibility:
// chunk ownership, commit guard, sequential geometry invalidation and quality policy.
assert.match(implementation,/chunkGroup\.name='satellite-terrain-chunks'/);
assert.match(implementation,/texture\.generateMipmaps=false/);
assert.match(implementation,/function invalidateGeometry\s*\(/);
assert.match(implementation,/await waitForCommitWindow\(\);/);
assert.match(implementation,/if\(index<pending\.length\)setTimeout\(step,0\);/);

const contractFiles=[
  'qa/qa-streaming-p913-transitions.mjs',
  'qa/qa-terrain-r1-legacy-ownership.mjs',
  'qa/qa-r8-current-ownership.mjs',
  'qa/qa-r8-issue2-imagery-diagnostics.mjs',
  'qa/qa-diagnostics-c6-final-inventory.mjs'
];
for(const file of contractFiles){
  const source=read(file);
  assert.doesNotMatch(source,/(?:\.\.\/)?src\/imagery-p913\.js/,
    `${file} still points at the retired root imagery P9.13 path`);
}

const c6=read('qa/qa-diagnostics-c6-final-inventory.mjs');
assert.match(c6,/direct-write:src\/imagery\/imagery-p913\.js/,
  'C6 platform-polyfill inventory must follow the nested imagery owner');

console.log('R8.2 IMAGERY SOURCE TREE BOUNDARY: PASS',{
  publicOwner,
  nestedImplementation,
  retiredRoot:legacyRoot,
  runtimeBypass:false,
  historicalNamePreserved:true
});

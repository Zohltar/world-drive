import assert from 'node:assert/strict';
import fs from 'node:fs';

const ROOT_FACADES=[
  'src/multiplayer.js',
  'src/multiplayer-visuals.js'
];
const INTERNAL=[
  'multiplayer-client-m3.js',
  'multiplayer-visuals-m3.js',
  'multiplayer-visuals-v18.js',
  'multiplayer-fallback-visual.js',
  'multiplayer-support-math.js',
  'multiplayer-vehicle-adapter.js',
  'multiplayer-vehicle-registry.js'
];
const moved=INTERNAL.map(name=>`src/multiplayer/${name}`);
const oldRoot=INTERNAL.map(name=>`src/${name}`);

for(const file of ROOT_FACADES)assert.ok(fs.existsSync(file),`R2 public facade missing: ${file}`);
for(const file of moved)assert.ok(fs.existsSync(file),`R2 moved multiplayer module missing: ${file}`);
for(const file of oldRoot)assert.equal(fs.existsSync(file),false,`R2 old root implementation returned: ${file}`);

const publicClient=fs.readFileSync('src/multiplayer.js','utf8');
const publicVisuals=fs.readFileSync('src/multiplayer-visuals.js','utf8');
assert.match(publicClient,/import\('\.\/multiplayer\/multiplayer-client-m3\.js'\)/,'multiplayer public facade must lazy-load moved client implementation');
assert.match(publicVisuals,/import\('\.\/multiplayer\/multiplayer-visuals-m3\.js'\)/,'multiplayer visual facade must lazy-load moved visual implementation');
assert.doesNotMatch(publicClient,/import\('\.\/multiplayer-client-m3\.js'\)/,'legacy root client dynamic path must be gone');
assert.doesNotMatch(publicVisuals,/import\('\.\/multiplayer-visuals-m3\.js'\)/,'legacy root visual dynamic path must be gone');

const client=fs.readFileSync('src/multiplayer/multiplayer-client-m3.js','utf8');
assert.match(client,/from '\.\.\/transmission-runtime-bridge\.js'/,'moved client must reach root transmission bridge through parent path');
assert.match(client,/from '\.\/multiplayer-vehicle-registry\.js'/,'moved client must keep registry as sibling');

const visuals=fs.readFileSync('src/multiplayer/multiplayer-visuals-m3.js','utf8');
assert.match(visuals,/from '\.\/multiplayer-visuals-v18\.js'/,'M4 implementation must keep support implementation as sibling');
assert.match(visuals,/from '\.\/multiplayer-vehicle-adapter\.js'/,'M4 implementation must keep adapter as sibling');
assert.match(visuals,/from '\.\.\/vehicle-render-contract\.js'/,'M4 implementation must reach vehicle render contract through parent path');
assert.match(visuals,/from '\.\.\/diagnostics\.js'/,'M4 implementation must reach diagnostics through parent path');

const adapter=fs.readFileSync('src/multiplayer/multiplayer-vehicle-adapter.js','utf8');
assert.match(adapter,/from '\.\.\/vehicle-system\.js'/,'moved adapter must reach vehicle system through parent path');
assert.match(adapter,/from '\.\.\/vehicle-authored-registry\.js'/,'moved adapter must reach authored registry through parent path');

const registry=fs.readFileSync('src/multiplayer/multiplayer-vehicle-registry.js','utf8');
assert.match(registry,/from '\.\.\/vehicle-system\.js'/,'moved registry must reach vehicle system through parent path');
assert.match(registry,/from '\.\.\/vehicle-authored-registry\.js'/,'moved registry must reach authored registry through parent path');

console.log('SOURCE TREE R2 MULTIPLAYER QA: PASS',JSON.stringify({
  rootFacades:ROOT_FACADES,
  movedInternals:moved,
  removedRootInternals:oldRoot
},null,2));

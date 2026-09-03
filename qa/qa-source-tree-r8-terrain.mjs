import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const exists=relative=>fs.existsSync(path.join(root,relative));

const facadePath='src/terrain-p926.js';
const nestedPath='src/terrain/terrain-p926.js';
const bridgePath='src/terrain/terrain-p925.js';
const basePath='src/terrain-p925.js';

for(const file of [facadePath,nestedPath,bridgePath,basePath,'src/terrain.js']){
  assert.equal(exists(file),true,`R8.5 terrain owner missing: ${file}`);
}

const facade=read(facadePath);
const nested=read(nestedPath);
const bridge=read(bridgePath);
const base=read(basePath);
const current=read('src/terrain.js');

assert.match(facade,/export\s*\{\s*createTerrainService\s*\}\s*from\s*['"]\.\/terrain\/terrain-p926\.js['"]/,
  'R8.5 root P9.26 facade must re-export the nested implementation');
assert.ok(facade.length<300,'R8.5 root P9.26 facade must stay thin');

assert.match(nested,/from ['"]\.\/terrain-p925\.js['"]/,
  'nested P9.26 implementation must keep its byte-for-byte sibling import contract');
assert.match(bridge,/export\s*\{\s*createTerrainService\s*\}\s*from\s*['"]\.\.\/terrain-p925\.js['"]/,
  'nested P9.25 bridge must point back to the stable root P9.25 owner');
assert.ok(bridge.length<260,'nested P9.25 bridge must stay thin');
assert.match(base,/export function createTerrainService\s*\(/,
  'sensitive P9.25 implementation must remain at the root owner');

for(const marker of [
  'P926_HORIZON_BUDGET_MS=1.15',
  'P926_HORIZON_GAP_MS=8',
  'function prepareHorizonIncremental()',
  'function commitPreparedHorizon(prepared)',
  'function rebuildHorizonIncremental()',
  'p926Diagnostics'
])assert.ok(nested.includes(marker),`nested P9.26 implementation missing: ${marker}`);

assert.match(current,/from ['"]\.\/terrain-p926\.js['"]/,
  'current terrain owner must keep consuming the stable root P9.26 facade');
assert.doesNotMatch(current,/\.\/terrain\/terrain-p926\.js/,
  'current terrain owner must not bypass the stable P9.26 facade');

const module=await import(new URL('../src/terrain-p926.js',import.meta.url));
assert.equal(typeof module.createTerrainService,'function',
  'root P9.26 facade must resolve createTerrainService at runtime');

console.log('SOURCE TREE R8 TERRAIN QA: PASS',{
  currentOwner:'src/terrain.js',
  p926Facade:facadePath,
  p926Implementation:nestedPath,
  p925Bridge:bridgePath,
  p925Implementation:basePath,
  behaviorChanged:false
});

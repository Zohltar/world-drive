import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

const facadePath='src/local-world-builder-p926.js';
const implementationPath='src/local-world/local-world-builder-p926.js';
const p925Path='src/local-world-builder-p925.js';
const entryPath='src/local-world-builder.js';
for(const path of [facadePath,implementationPath,p925Path,entryPath]){
  assert.equal(fs.existsSync(path),true,`R8.4 local-world path missing: ${path}`);
}

const facade=fs.readFileSync(facadePath,'utf8');
const implementation=fs.readFileSync(implementationPath,'utf8');
const p925=fs.readFileSync(p925Path,'utf8');
const entry=fs.readFileSync(entryPath,'utf8');

assert.match(facade,/export\s*\{\s*createLocalWorldBuilder\s*\}\s*from\s*['"]\.\/local-world\/local-world-builder-p926\.js['"]/,
  'root P9.26 facade must re-export the nested implementation');
assert.ok(facade.length<320,'root P9.26 facade must stay thin');
assert.match(implementation,/export function createLocalWorldBuilder\s*\(/,
  'nested P9.26 implementation must own createLocalWorldBuilder');
assert.match(implementation,/from ['"]\.\.\/local-world-builder-p925\.js['"]/,
  'nested P9.26 must continue using the root P9.25 owner');
assert.match(implementation,/captureHorizonOrigin/);
assert.match(implementation,/restoreHorizonOrigin/);
assert.match(implementation,/rebuildHorizonIncremental/);
assert.match(implementation,/p926Horizon/);
assert.match(p925,/export function createLocalWorldBuilder\s*\(/,
  'P9.25 sensitive prepared-world implementation must remain root');
assert.match(entry,/from ['"]\.\/local-world-builder-p926\.js['"]/,
  'current local-world entry must continue consuming the stable root P9.26 path');
assert.doesNotMatch(entry,/\.\/local-world\/local-world-builder-p926\.js/,
  'current local-world entry must not bypass the stable P9.26 facade');

const module=await import(`${pathToFileURL(`${process.cwd()}/${facadePath}`).href}?qa=${Date.now()}`);
assert.equal(typeof module.createLocalWorldBuilder,'function','root P9.26 facade dynamic import failed');

console.log('SOURCE TREE R8 LOCAL-WORLD QA: PASS',{
  facade:facadePath,
  implementation:implementationPath,
  sensitiveP925KeptRoot:true,
  currentEntryUsesFacade:true
});

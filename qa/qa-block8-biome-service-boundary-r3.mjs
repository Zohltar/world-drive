// Permanent domain ownership check. The libraries have no transport/renderer dependency.
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,resolve,dirname} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const folder=join(root,'src/scenery/biomes');
const names=['tile-transport.js','route-tile-plan.js','route-preparer.js','biome-profiles.js','regional-classifier.js','local-refinement.js','biome-service.js','palette-registry.js'];
assert.deepEqual(readdirSync(folder).sort(),names.toSorted());
for(const name of names) {
  const source=readFileSync(join(folder,name),'utf8');
  for(const match of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
    assert.ok(match[1].startsWith('./'),`${name}: non-local dependency ${match[1]}`);
    assert.ok(names.includes(match[1].slice(2)),`${name}: unknown domain dependency`);
  }
  if(name!=='tile-transport.js')assert.doesNotMatch(source,/\b(?:fetch|setTimeout|setInterval|requestIdleCallback|requestAnimationFrame)\s*\(/);
  else assert.doesNotMatch(source,/\b(?:setInterval|requestIdleCallback|requestAnimationFrame)\s*\(/);
  assert.doesNotMatch(source,/\bMath\.random\s*\(/);
  assert.doesNotMatch(source,/\b(?:window|document|THREE)\./);
}
for(const [oldName,newName] of [['biome-classifier-prototype.mjs','regional-classifier.js'],['local-refinement-prototype.mjs','local-refinement.js']]) {
  const source=readFileSync(join(root,'tools/biomes',oldName),'utf8');
  assert.ok(source.includes(`export * from '../../src/scenery/biomes/${newName}'`));
  assert.ok(source.split('\n').length<=4,'Prototype facade has diverging implementation');
}
// This assertion describes R3 specifically: visual activation requires a later
// explicit change to this test together with the separately certified integration.
function files(path) {return readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(path,e.name)):[join(path,e.name)]);}
for(const path of files(join(root,'src'))) {
  if(path.startsWith(folder+'/')||!path.endsWith('.js'))continue;
  const source=readFileSync(path,'utf8');
  for(const m of source.matchAll(/(?:from\s*|import\s*\(\s*|import\s*)['"]([^'"]+)['"]/g)) {
    assert.ok(!resolve(dirname(path),m[1]).startsWith(folder+'/'),`Unexpected R3 game activation: ${path}`);
  }
}
const audit=readFileSync(join(root,'qa/DEV_INTEGRATION_AUDIT.mjs'),'utf8');
assert.ok(audit.includes("await import('./qa-block8-biome-service-r3.mjs')"));
assert.ok(audit.includes("await import('./qa-block8-biome-service-boundary-r3.mjs')"));
console.log('PASS Block 8 maintained biome service ownership; game activation remains absent');

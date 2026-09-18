// Permanent domain ownership check. The libraries have no transport/renderer dependency.
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,resolve,dirname} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const folder=join(root,'src/scenery/biomes');
const names=['gameplay-diagnostics.js','route-observer-plan.js','forest-candidate-adapter.js','chunk-context-snapshot.js','chunk-context-bridge.js','batch-source.js','batch-route-session.js','biome-preparation-worker.js','biome-worker-client.js','tile-transport.js','route-tile-plan.js','route-preparer.js','biome-profiles.js','regional-classifier.js','local-refinement.js','biome-service.js','palette-registry.js'];
assert.deepEqual(readdirSync(folder).sort(),names.toSorted());
for(const name of names) {
  const source=readFileSync(join(folder,name),'utf8');
  for(const match of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
    if(name==='forest-candidate-adapter.js'&&match[1]==='../../forest-streaming-policy.js')continue;
    assert.ok(match[1].startsWith('./'),`${name}: non-local dependency ${match[1]}`);
    assert.ok(names.includes(match[1].slice(2)),`${name}: unknown domain dependency`);
  }
  if(!['tile-transport.js','batch-source.js','biome-worker-client.js','gameplay-diagnostics.js'].includes(name))assert.doesNotMatch(source,/\b(?:fetch|setTimeout|setInterval|requestIdleCallback|requestAnimationFrame)\s*\(/);
  else assert.doesNotMatch(source,/\b(?:setInterval|requestIdleCallback|requestAnimationFrame)\s*\(/);
  assert.doesNotMatch(source,/\bMath\.random\s*\(/);
  assert.doesNotMatch(source,/\b(?:window|document|THREE)\./);
}
for(const [oldName,newName] of [['biome-classifier-prototype.mjs','regional-classifier.js'],['local-refinement-prototype.mjs','local-refinement.js']]) {
  const source=readFileSync(join(root,'tools/biomes',oldName),'utf8');
  assert.ok(source.includes(`export * from '../../src/scenery/biomes/${newName}'`));
  assert.ok(source.split('\n').length<=4,'Prototype facade has diverging implementation');
}
// Direct domain imports remain limited to R8; the explicit R12 port is guarded separately.
function files(path) {return readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(path,e.name)):[join(path,e.name)]);}
for(const path of files(join(root,'src'))) {
  if(path.startsWith(folder+'/')||!path.endsWith('.js'))continue;
  const source=readFileSync(path,'utf8');
  for(const m of source.matchAll(/(?:from\s*|import\s*\(\s*|import\s*)['"]([^'"]+)['"]/g)) {
    const dependency=resolve(dirname(path),m[1]);
    if(path===join(root,'src/app/biome-diagnostics.js')&&dependency===join(folder,'gameplay-diagnostics.js'))continue;
    assert.ok(!dependency.startsWith(folder+'/'),`Unexpected biome dependency: ${path}`);
  }
}
const audit=readFileSync(join(root,'qa/DEV_INTEGRATION_AUDIT.mjs'),'utf8');
assert.ok(audit.includes("await import('./qa-block8-biome-service-r3.mjs')"));
assert.ok(audit.includes("await import('./qa-block8-biome-service-boundary-r3.mjs')"));
console.log('PASS Block 8 maintained biome service ownership; direct domain imports remain limited to the R8 observer; R12 opt-in port is guarded separately');

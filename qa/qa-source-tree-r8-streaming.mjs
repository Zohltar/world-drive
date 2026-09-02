import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

const facadePath=path.join(root,'src','streaming-coordinator-p913.js');
const nestedPath=path.join(root,'src','streaming','streaming-coordinator-p913.js');
assert.equal(fs.existsSync(facadePath),true,'R8.3 root P9.13 facade missing');
assert.equal(fs.existsSync(nestedPath),true,'R8.3 nested P9.13 implementation missing');

const facade=read('src/streaming-coordinator-p913.js');
const nested=read('src/streaming/streaming-coordinator-p913.js');
const current=read('src/streaming-coordinator.js');

assert.match(facade,/export\s*\{\s*createStreamingCoordinator\s*\}\s*from\s*['"]\.\/streaming\/streaming-coordinator-p913\.js['"]/);
assert.ok(facade.length<300,'R8.3 root facade must stay thin');
assert.match(nested,/export function createStreamingCoordinator\s*\(/);
assert.match(nested,/softRecenterDistance:520/);
assert.match(nested,/emergencyWorldRefreshDistance:2680/);
assert.match(nested,/function commitWorldRefresh\s*\(/);
assert.match(current,/from ['"]\.\/streaming-coordinator-p913\.js['"]/,
  'current coordinator should keep stable root P9.13 facade import');
assert.doesNotMatch(current,/\.\/streaming\/streaming-coordinator-p913\.js/,
  'current coordinator must not bypass the stable root facade in R8.3');
assert.doesNotMatch(nested,/^\s*import\s/m,'nested historical scheduler unexpectedly gained imports');

const facadeModule=await import(pathToFileURL(facadePath).href);
const nestedModule=await import(pathToFileURL(nestedPath).href);
assert.equal(typeof facadeModule.createStreamingCoordinator,'function');
assert.equal(typeof nestedModule.createStreamingCoordinator,'function');
assert.strictEqual(facadeModule.createStreamingCoordinator,nestedModule.createStreamingCoordinator,
  'root facade must resolve the nested implementation');

console.log('SOURCE TREE R8.3 STREAMING QA: PASS',{
  rootFacade:true,
  nestedImplementation:true,
  implementationBytePath:'src/streaming/streaming-coordinator-p913.js',
  currentOwner:'src/streaming-coordinator.js',
  currentOwnerBypassesFacade:false
});

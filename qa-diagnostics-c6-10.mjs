import assert from 'node:assert/strict';
import fs from 'node:fs';
import {civilTrafficPreloadDiagnostics} from './src/traffic/civil-traffic-preload.js';

const source=fs.readFileSync('src/traffic/civil-traffic-preload.js','utf8');
assert.ok(source.includes("import {ensureWorldDriveDiagnostics} from '../diagnostics.js';"),'diagnostics root import missing');
assert.ok(source.includes('ensureWorldDriveDiagnostics().traffic.preload=civilTrafficPreloadDiagnostics;'),'canonical traffic preload diagnostics writer missing');
assert.ok(!source.includes('globalThis.WorldDriveTrafficPreload'),'legacy WorldDriveTrafficPreload writer remains');
assert.ok(source.includes('state.pack.promise=state.sonata.promise'),'sequential Sonata -> pack preload contract changed');
assert.ok(source.includes('GLTFLoader.prototype.loadAsync=function'),'GLTFLoader reuse patch changed');
assert.ok(source.includes("fetch(url,{cache:'force-cache'})"),'force-cache preload behavior changed');

const diag=civilTrafficPreloadDiagnostics();
assert.deepEqual(Object.keys(diag),['started','patched','phase','sonata','pack'],'preload diagnostics top-level payload changed');
assert.deepEqual(Object.keys(diag.sonata),['ready','error','fetchMs','parseMs'],'Sonata preload payload changed');
assert.deepEqual(Object.keys(diag.pack),['ready','error','fetchMs','parseMs','buildMs','templates'],'pack preload payload changed');
assert.equal(diag.started,false);
assert.equal(diag.patched,false);
assert.equal(diag.phase,'idle');
assert.equal(diag.sonata.ready,false);
assert.equal(diag.pack.ready,false);
assert.equal(diag.pack.templates,0);

const second=civilTrafficPreloadDiagnostics();
assert.notEqual(second,diag,'preload diagnostics must allocate a fresh snapshot per call');
assert.notEqual(second.sonata,diag.sonata,'Sonata diagnostics must allocate per call');
assert.notEqual(second.pack,diag.pack,'pack diagnostics must allocate per call');

console.log('CLEANUP C6.10 TRAFFIC-PRELOAD DIAGNOSTICS QA: PASS',{
  legacyRemoved:true,
  canonicalPath:'WorldDriveDiagnostics.traffic.preload',
  payloadShapePreserved:true,
  sequentialPreloadPreserved:true,
  loaderReusePreserved:true
});

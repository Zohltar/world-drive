import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createImageryService} from '../src/imagery.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const wrapperSource=fs.readFileSync(path.join(root,'src','imagery.js'),'utf8');
const baseSource=fs.readFileSync(path.join(root,'src','imagery-p913.js'),'utf8');

// Diagnostic-only contract: the proven P9.13 resampling path still owns actual
// geometry replacement and keeps the same commit-window / sequential cadence.
assert.match(baseSource,/async function waitForCommitWindow\s*\(/);
assert.match(baseSource,/await waitForCommitWindow\(\);/);
assert.match(baseSource,/refreshEntryGeometry\(entry\);/);
assert.match(baseSource,/if\(index<pending\.length\)setTimeout\(step,0\);/);
assert.match(wrapperSource,/const baseInvalidateGeometry=service\.invalidateGeometry\?\.bind\(service\);/);
assert.match(wrapperSource,/baseInvalidateGeometry\?\.\(\);/);
assert.match(wrapperSource,/r8GeometryRefresh:\{/);
assert.doesNotMatch(wrapperSource,/PREFETCH_COOLDOWN_MS\s*=\s*(?!420\b)/);

class FakeGroup{
  constructor(){this.children=[];this.parent=null;this.visible=true;}
  add(child){
    if(!this.children.includes(child))this.children.push(child);
    child.parent=this;
  }
  remove(child){
    this.children=this.children.filter(entry=>entry!==child);
    if(child?.parent===this)child.parent=null;
  }
}

const THREE={Group:FakeGroup};
const groundMaterial={
  map:null,
  vertexColors:true,
  color:{r:1,g:1,b:1,set(){this.r=1;this.g=1;this.b=1;}},
  needsUpdate:false
};

const service=createImageryService({
  THREE,
  groundMaterial,
  toLatLon:()=>({lat:0,lon:0}),
  toWorld:()=>({x:0,z:0}),
  getWorldOffset:()=>({x:0,z:0})
});

const initial=service.diagnostics().r8GeometryRefresh;
assert.deepEqual(
  {
    generation:initial.generation,
    runs:initial.runs,
    active:initial.active,
    activeJobs:initial.activeJobs,
    pendingChunks:initial.pendingChunks,
    lastReason:initial.lastReason
  },
  {generation:0,runs:0,active:false,activeJobs:0,pendingChunks:0,lastReason:null}
);

// Add a visible mesh only to exercise the additive observer. It is deliberately
// not inserted into the base service's private chunk map, so the QA cannot alter
// or depend on production resampling implementation details.
const mesh={geometry:{name:'before'},parent:null};
service.group.add(mesh);
service.invalidateGeometry('qa-manual');

const active=service.diagnostics().r8GeometryRefresh;
assert.equal(active.generation,1);
assert.equal(active.runs,1);
assert.equal(active.active,true);
assert.equal(active.activeJobs,1);
assert.equal(active.totalChunks,1);
assert.equal(active.completedChunks,0);
assert.equal(active.pendingChunks,1);
assert.equal(active.lastReason,'qa-manual');
assert.ok(Number.isFinite(active.lastStartedAt));
assert.equal(active.lastCompletedAt,null);
assert.equal(active.monitorIntervalMs,120);

// Geometry identity change is exactly what the observer watches in production.
mesh.geometry={name:'after'};
await new Promise(resolve=>setTimeout(resolve,170));

const done=service.diagnostics().r8GeometryRefresh;
assert.equal(done.generation,1);
assert.equal(done.runs,1);
assert.equal(done.active,false);
assert.equal(done.activeJobs,0);
assert.equal(done.totalChunks,1);
assert.equal(done.completedChunks,1);
assert.equal(done.pendingChunks,0);
assert.ok(Number.isFinite(done.lastCompletedAt));
assert.ok(done.lastCompletedAt>=done.lastStartedAt);
assert.ok(done.lastDurationMs>=0);
assert.ok(done.maxDurationMs>=done.lastDurationMs);
assert.equal(done.lastReason,'qa-manual');

service.destroy();

console.log('R8 ISSUE #2 IMAGERY DIAGNOSTICS: PASS',{
  telemetry:'additive',
  productionResamplingOwner:'imagery-p913.js',
  visiblePath:'WorldDriveFramePacing().imagery.r8GeometryRefresh'
});

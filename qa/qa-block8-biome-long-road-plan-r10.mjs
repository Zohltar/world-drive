import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readManicFixture,buildLongRoadPlan,MAX_AUTHORING_TILES,MAX_AUTHORING_CHUNKS} from '../tools/biomes/long-road-plan-r10.mjs';
import {createBiomeObserverPlan} from '../src/scenery/biomes/route-observer-plan.js';
import {createForestCandidateAdapter} from '../src/scenery/biomes/forest-candidate-adapter.js';
const fixture=fileURLToPath(new URL('./fixtures/biomes/manic-r10',import.meta.url));
const {coordinates,receipt}=readManicFixture(fixture),origin={lon:receipt.requestPoints[0][0],lat:receipt.requestPoints[0][1]};
const plan=buildLongRoadPlan(coordinates,{origin});
assert.equal(plan.pointCount,1497);assert.equal(plan.windows.length,800);assert.equal(plan.chunks.length,383);assert.equal(plan.addresses.length,26);
assert.equal(plan.origin.lat,49.3213);assert.equal(plan.origin.lon,-68.3467);
assert.notDeepEqual(coordinates[0],[origin.lon,origin.lat],'fixture must exercise router snapping versus game origin');
assert.ok(Math.abs(plan.totalMeters-receipt.lengthMeters)<.01);
assert.equal(JSON.stringify(plan),JSON.stringify(buildLongRoadPlan(coordinates,{origin})),'determinism');
assert.ok(plan.addresses.length<MAX_AUTHORING_TILES&&plan.chunks.length<MAX_AUTHORING_CHUNKS);
assert.throws(()=>buildLongRoadPlan(coordinates,{stepMeters:0}));assert.throws(()=>buildLongRoadPlan(coordinates,{stepMeters:481}));
assert.throws(()=>buildLongRoadPlan([[0,0],[30,0]]));assert.throws(()=>buildLongRoadPlan([[NaN,0],[1,1]]));
// Compare new authoring traversal with maintained observer, not a copied formula.
const observer=createBiomeObserverPlan(coordinates.map(([lon,lat])=>({lon,lat})),{origin,routeId:plan.routeId});
let comparisons=0;
for(let i=0;i<plan.windows.length;i++){
  const w=plan.windows[i],got=observer.locate(w.x,w.z);
  assert.ok(Math.abs(got.progress-w.position)<1e-5,'progress parity');
  // On the single turnaround sample no reverse motion has occurred yet.
  if(i===400)continue;
  assert.equal(got.direction,w.direction,'direction');
  assert.deepEqual(got.chunks,w.chunks.map(({cx,cz,role})=>({cx,cz,role})),'actual current/forward chunk parity');comparisons++;
}
// Every selected complete chunk is inside a provisioned tile, including corners.
const tiles=new Set(plan.addresses.map(([x,y])=>`${x}:${y}`)),a=createForestCandidateAdapter(plan),scratch={};let points=0;
for(const chunk of plan.chunks)for(let i=0;i<1744;i++){
  a.point(chunk.cx,chunk.cz,i,scratch);
  assert.ok(tiles.has(`${Math.floor((scratch.lon+180)*10)}:${Math.floor((90-scratch.lat)*10)}`),'candidate escaped continuous corridor');points++;
}
const temp=mkdtempSync(path.join(tmpdir(),'manic-pin-'));
try{
  writeFileSync(path.join(temp,'response.json.gz'),readFileSync(path.join(fixture,'response.json.gz')));
  const raw=readFileSync(path.join(fixture,'receipt.json'));writeFileSync(path.join(temp,'receipt.json'),raw);
  assert.doesNotThrow(()=>readManicFixture(temp));
  writeFileSync(path.join(temp,'receipt.json'),JSON.stringify({...receipt,requestPoints:[[0,0],[1,1]]}));
  assert.throws(()=>readManicFixture(temp),/provenance/);
  writeFileSync(path.join(temp,'receipt.json'),raw);writeFileSync(path.join(temp,'response.json.gz'),'invalid');
  assert.throws(()=>readManicFixture(temp));
}finally{rmSync(temp,{recursive:true,force:true});}
console.log(JSON.stringify({status:'PASS',groups:8,vertices:coordinates.length,windows:800,observerComparisons:comparisons,
  originUsesPresetNotRouterSnap:true,exactCandidateAddressChecks:points,tiles:26,chunks:383}));

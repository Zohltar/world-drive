import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRoutingGeometry} from '../src/routing/routing.js';
import {
  createWaterProximityIndex,
  pointSegmentDistanceSquared
} from '../src/geography/spatial-proximity-index.js';
import {FOREST_STREAMING_POLICY as FOREST} from '../src/forest-streaming-policy.js';

assert.equal(FOREST.candidatesPerBuildSlice,12,'Block 8 R2 must not repeat the rejected candidate-cap increase');
assert.equal(FOREST.forestCatchupCandidatesPerSlice,20,'Block 8 R2 must preserve the certified catch-up cap');
assert.equal(FOREST.forestSliceBudgetMs,.95,'Block 8 R2 changed the certified normal slice budget');
assert.equal(FOREST.forestCatchupSliceBudgetMs,1.55,'Block 8 R2 changed the certified catch-up slice budget');

const coreSource=fs.readFileSync(new URL('../src/forest-chunk-streamer-core.js',import.meta.url),'utf8');
const scenerySource=fs.readFileSync(new URL('../src/scenery/scenery-renderer-p9.js',import.meta.url),'utf8');
const mainSource=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const wrapperSource=fs.readFileSync(new URL('../src/forest-chunk-streamer.js',import.meta.url),'utf8');

assert.ok(coreSource.includes("typeof isNearRoute==='function'"),'forest core does not use the bounded route predicate');
assert.ok(scenerySource.includes('nearestRoute,isNearRoute,isWaterAt'),'scenery owner does not pass the route predicate');
assert.ok(mainSource.includes('createWaterProximityIndex'),'main does not own the hydro proximity index');
assert.ok(mainSource.includes("installDiagnosticAlias('__WORLD_DRIVE_BLOCK8_SPATIAL__'"),'spatial diagnostics alias is missing');
assert.ok(mainSource.includes('waterProximity.invalidate();')&&mainSource.includes('waterProximity.rebuild();'),
  'hydro reload does not rebuild its spatial index before vegetation reconciliation');
assert.ok(wrapperSource.includes("readinessMode:'block8-r2-spatial-proximity'"),'R2 readiness mode marker is missing');

const segments=[];
for(let i=0;i<5000;i++){
  const az=i*20,bz=(i+1)*20;
  segments.push({ax:0,az,bx:0,bz,len:20,cum:az});
}
const routing=createRoutingGeometry({
  getSegments:()=>segments,
  getRouteLength:()=>100000
});

let routeChecks=0;
for(let i=0;i<180;i++){
  const z=40+i*527;
  for(const x of [-200,-121,-120,-33,-32,-12,0,12,31,32,120,121,200]){
    for(const limit of [32,121,200]){
      for(const inclusive of [false,true]){
        const nearest=routing.nearestRoute(x,z);
        const expected=inclusive?nearest.d<=limit:nearest.d<limit;
        assert.equal(
          routing.isNearRoute(x,z,limit,inclusive),
          expected,
          `route proximity parity failed at ${x},${z}, limit ${limit}, inclusive ${inclusive}`
        );
        routeChecks++;
      }
    }
  }
}
const routeStats=routing.proximityStats();
assert.ok(routeStats.rebuilds>=1,'route proximity index was never built');
assert.ok(routeStats.fallbackQueries>0,'route exact fallback path was not exercised');
assert.ok(routeStats.index.maxCandidatesTested<160,
  `route spatial bucket is not bounded: ${routeStats.index.maxCandidatesTested} / ${segments.length}`);

function pointInPolygon(x,z,points){
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[i],b=points[j];
    if(((a.z>z)!==(b.z>z))&&(x<(b.x-a.x)*(z-a.z)/((b.z-a.z)||1e-9)+a.x))inside=!inside;
  }
  return inside;
}
function waterWidth(tags={}){
  if(tags.width){
    const width=Number(tags.width);
    if(Number.isFinite(width))return Math.max(5,Math.min(220,width));
  }
  if(tags.waterway==='river')return 34;
  if(tags.waterway==='stream')return 7;
  return 18;
}
function directWaterAt(features,x,z,margin){
  for(const feature of features){
    const points=feature.points||[];
    if(!points.length)continue;
    if(feature.kind==='polygon'){
      if(pointInPolygon(x,z,points))return true;
      const limit2=margin*margin;
      for(let i=0;i<points.length;i++){
        if(pointSegmentDistanceSquared(x,z,points[i],points[(i+1)%points.length])<limit2)return true;
      }
    }else{
      const half=Math.max(margin,waterWidth(feature.tags)*.55+margin);
      const limit2=half*half;
      for(let i=0;i<points.length-1;i++){
        if(pointSegmentDistanceSquared(x,z,points[i],points[i+1])<limit2)return true;
      }
    }
  }
  return false;
}

const waterFeatures=[
  {kind:'polygon',points:[{x:-60,z:-60},{x:60,z:-60},{x:60,z:60},{x:-60,z:60}],tags:{natural:'water'}},
  {kind:'line',points:[{x:600,z:-120},{x:600,z:120}],tags:{waterway:'river'}}
];
for(let i=0;i<1200;i++){
  const x=1800+i*280,z=900+(i%7)*320;
  waterFeatures.push({kind:'line',points:[{x,z},{x:x+90,z:z+45}],tags:{waterway:'stream'}});
}
const waterIndex=createWaterProximityIndex({
  getFeatures:()=>waterFeatures,
  waterWidth,
  pointInPolygon,
  cellSize:240,
  maxMargin:16,
  maxIndexedCells:900
});

let waterChecks=0;
for(let i=0;i<500;i++){
  const x=-120+i*701,z=-180+(i%17)*173;
  for(const margin of [4,8,16,24]){
    assert.equal(
      waterIndex.isWaterAt(x,z,margin),
      directWaterAt(waterFeatures,x,z,margin),
      `water proximity parity failed at ${x},${z}, margin ${margin}`
    );
    waterChecks++;
  }
}
const beforeMutation=waterIndex.stats();
assert.ok(beforeMutation.fallbackQueries>0,'water margin fallback path was not exercised');
assert.ok(beforeMutation.index.maxCandidatesTested<80,
  `water spatial bucket is not bounded: ${beforeMutation.index.maxCandidatesTested} / ${waterFeatures.length}`);

waterFeatures.push({
  kind:'polygon',
  points:[{x:900,z:900},{x:980,z:900},{x:980,z:980},{x:900,z:980}],
  tags:{natural:'water'}
});
waterIndex.invalidate();
waterIndex.rebuild();
assert.equal(waterIndex.isWaterAt(940,940,8),true,'hydro index rebuild did not include new feature');

console.log('PASS Block 8 R2 exact geographic proximity index QA');
console.log({
  routeChecks,
  routeSegments:segments.length,
  routeMaxCandidates:routeStats.index.maxCandidatesTested,
  routeFallbackQueries:routeStats.fallbackQueries,
  waterChecks,
  waterFeatures:waterFeatures.length,
  waterMaxCandidates:beforeMutation.index.maxCandidatesTested,
  waterFallbackQueries:beforeMutation.fallbackQueries
});

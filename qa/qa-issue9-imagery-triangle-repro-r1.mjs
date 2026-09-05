import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const main=read('src/main.js');
const terrain=read('src/terrain-p925.js');
const imagery=read('src/imagery/imagery-p913.js');
const presets=read('src/routing/route-presets.js');

// Lock the exact runtime ingredients behind the human Yungas reproduction.
assert.match(main,/zoom:16,/,'imagery zoom changed; update Issue #9 repro');
assert.match(main,/chunkTiles:3,/,'imagery chunk tile count changed; update Issue #9 repro');
assert.match(main,/chunkSegments:96/,'imagery chunk segment count changed; update Issue #9 repro');
assert.match(imagery,/indices\.push\(a,c,b,b,c,d\)/,'satellite cell triangulation changed; update Issue #9 repro');
assert.match(main,/sampleRoadVisualHeight:\(x,z\)=>terrainService\.roadVisualHeightAt\?\.\(x,z\)/,'road visual sampler wiring changed');
assert.match(terrain,/const visualInner=Math\.max\(roadBedOptions\.roadHalfWidth-\.15,5\.20\)/,'refined road inner corridor changed');
assert.match(terrain,/const rise=1-Math\.pow\(1-Math\.max\(0,Math\.min\(1,t\)\),2\.35\)/,'refined road side-slope blend changed');
assert.match(presets,/YUNGAS_START=\{\s*lat:-16\.29911,/s,'Yungas start latitude changed');

const EARTH_RADIUS_M=6378137;
const latitude=-16.29911;
const zoom=16;
const chunkTiles=3;
const chunkSegments=96;
const roadHalfWidth=5.4;
const terrainCutHalfWidth=16.5;
const blendWidth=14;
const surfaceOffset=.20;
const roadSurfaceOffset=.10;

// Web-Mercator ground width of one slippy tile at the Yungas latitude.
const tileWidth=2*Math.PI*EARTH_RADIUS_M*Math.cos(latitude*Math.PI/180)/(2**zoom);
const chunkWidth=tileWidth*chunkTiles;
const sampleStep=chunkWidth/chunkSegments;
const nearTerrainStep=5600/448;

// Synthetic steep cut: straight road centerline at x=0, road profile y=0,
// mountain rising at 3 m vertical per 1 m lateral on the +x side. This is not
// a claim about the exact Yungas DEM value; it isolates the triangulation
// mechanism seen by the user under an intentionally extreme mountain cut.
const supportY=-surfaceOffset;
const visualInner=Math.max(roadHalfWidth-.15,5.20);
const visualOuter=Math.max(visualInner+1,terrainCutHalfWidth+blendWidth);
function naturalY(x){return Math.max(0,3*x);}
function refinedVisualY(x){
  const natural=naturalY(x);
  const distance=Math.abs(x);
  if(distance<=visualInner)return Math.min(natural,supportY);
  if(distance>=visualOuter)return natural;
  const t=(distance-visualInner)/Math.max(.001,visualOuter-visualInner);
  const rise=1-Math.pow(1-Math.max(0,Math.min(1,t)),2.35);
  return Math.min(natural,supportY*(1-rise)+natural*rise);
}

// Put the road center halfway between two satellite samples: this is a legal
// phase alignment of the fixed chunk grid. The current geometry samples only
// the endpoints, then linearly triangulates between them. A steep outside
// sample can therefore lift the triangle several metres above the asphalt even
// though the analytic road sampler itself is correct at x=0.
const halfStep=sampleStep/2;
const leftY=refinedVisualY(-halfStep);
const rightY=refinedVisualY(halfStep);
const interpolatedCenterY=(leftY+rightY)/2;
const analyticCenterY=refinedVisualY(0);
const asphaltY=roadSurfaceOffset;
const intrusion=interpolatedCenterY-asphaltY;

assert.ok(sampleStep>nearTerrainStep+4,
  `expected Yungas satellite sampling to be materially coarser than near terrain; got ${sampleStep.toFixed(3)} m vs ${nearTerrainStep.toFixed(3)} m`);
assert.ok(analyticCenterY<asphaltY,
  'analytic refined terrain itself must remain below asphalt at road center');
assert.ok(interpolatedCenterY>asphaltY+1,
  `synthetic fixed-grid triangle did not reproduce road intrusion; clearance=${(-intrusion).toFixed(3)} m`);

console.log('ISSUE #9 IMAGERY TRIANGLE REPRO R1: PASS');
console.log(JSON.stringify({
  latitude,
  zoom,
  chunkTiles,
  chunkSegments,
  tileWidthM:Number(tileWidth.toFixed(3)),
  chunkWidthM:Number(chunkWidth.toFixed(3)),
  satelliteSampleStepM:Number(sampleStep.toFixed(3)),
  nearTerrainStepM:Number(nearTerrainStep.toFixed(3)),
  synthetic:{
    leftY:Number(leftY.toFixed(3)),
    rightY:Number(rightY.toFixed(3)),
    analyticRoadCenterY:Number(analyticCenterY.toFixed(3)),
    interpolatedTriangleCenterY:Number(interpolatedCenterY.toFixed(3)),
    asphaltY,
    intrusionAboveAsphaltM:Number(intrusion.toFixed(3))
  }
},null,2));

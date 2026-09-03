import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createTerrainService} from '../src/terrain.js';

const source=fs.readFileSync(new URL('../src/terrain.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const baseSource=fs.readFileSync(new URL('../src/terrain-p925.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');

// Issue #4 contract: geometry authority remains the broad safety cut. The fix is
// appearance-only and must not collapse the R1 separation between hidden safety
// excavation and refined visible earthwork.
assert.match(baseSource,/function groundTerrainHeight\(x,z\)/,'Issue #4: safety-cut ground owner missing');
assert.match(baseSource,/function refinedRoadVisualHeight\(x,z,naturalY\)/,'Issue #4: refined visible earthwork owner missing');
assert.match(source,/function normalizeRoadCutGroundAppearance\(\)/,'Issue #4: road-cut appearance normalization missing');
assert.match(source,/base\.roadVisualHeightAt\(wx,wz\)/,'Issue #4: normalization must stay bounded to the road visual corridor');
assert.match(source,/const naturalShade=terrainHillshade\(nx,ny,nz\)/,'Issue #4: natural DEM hillshade recalibration missing');
assert.match(source,/normal\.needsUpdate=true;color\.needsUpdate=true/,'Issue #4: corrected GPU normal/color buffers must be invalidated');
assert.match(source,/const result=base\.setRoadBed\(transitionProfile,transitionOptions\);\n\s*normalizeRoadCutGroundAppearance\(\);/,'Issue #4: synchronous road install must normalize exposed ground appearance');
assert.match(source,/function rebuildGround\(\)[\s\S]*?base\.rebuildGround\?\.\(\);[\s\S]*?normalizeRoadCutGroundAppearance\(\);/,'Issue #4: direct ground rebuild must normalize exposed ground appearance');

// Functional proof on a synthetic sloped DEM. The road is intentionally far
// below the natural terrain, making the hidden broad safety cut much steeper
// than the refined visible road earthwork around x ~= 12 m.
const ground=new THREE.Mesh(
  new THREE.PlaneGeometry(120,120,8,8),
  new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:1})
);
const horizonGroup=new THREE.Group();
const naturalHeight=(x,z)=>x*.25+z*.08;
const elevation={
  worldToLatLon:()=>null,
  relativeWorldHeight:(x,z)=>naturalHeight(x,z),
  relativeElevationAt:()=>null
};
const terrain=createTerrainService({
  THREE,
  elevation,
  ground,
  horizonGroup,
  getWorldOffset:()=>({x:0,z:0}),
  applyImagery:()=>{},
  groundSize:120,
  groundSegments:20
});

const profile=[];
for(let z=-80;z<=80;z+=5)profile.push({x:0,z,y:-20,roll:0});
terrain.setRoadBed(profile,{
  roadHalfWidth:5.4,
  terrainCutHalfWidth:16.5,
  blendWidth:14,
  surfaceOffset:.20,
  startPad:null
});

const positions=ground.geometry.getAttribute('position');
const normals=ground.geometry.getAttribute('normal');
const colors=ground.geometry.getAttribute('color');
assert(positions&&normals&&colors,'Issue #4: rebuilt ground buffers missing');

let bestIndex=-1,bestD=Infinity;
for(let i=0;i<positions.count;i++){
  const d=Math.hypot(positions.getX(i)-12,positions.getZ(i));
  if(d<bestD){bestD=d;bestIndex=i;}
}
assert(bestIndex>=0&&bestD<1,'Issue #4: synthetic road-cut probe vertex not found');
const x=positions.getX(bestIndex),z=positions.getZ(bestIndex);
const groundY=positions.getY(bestIndex);
const refinedY=terrain.renderHeightAt(x,z);
assert(
  groundY<refinedY-.25,
  `Issue #4: safety geometry must remain deeper than refined visible earthwork (${groundY} vs ${refinedY})`
);

const expected=new THREE.Vector3(-.25,1,-.08).normalize();
const actual=new THREE.Vector3(
  normals.getX(bestIndex),
  normals.getY(bestIndex),
  normals.getZ(bestIndex)
).normalize();
assert(
  actual.dot(expected)>.999,
  `Issue #4: exposed safety-cut ground normal must follow natural DEM (${actual.toArray()} vs ${expected.toArray()})`
);
assert(colors.getX(bestIndex)>.01&&colors.getY(bestIndex)>.01&&colors.getZ(bestIndex)>.01,
  'Issue #4: exposed safety-cut vertex color must remain non-black');

const diagnostics=terrain.p927Diagnostics?.();
assert((diagnostics?.photoOffAppearanceRuns||0)>=1,'Issue #4: appearance normalization diagnostics did not run');
assert((diagnostics?.photoOffAppearanceAdjustedVertices||0)>0,'Issue #4: no road-corridor vertices were normalized');

console.log('ISSUE 4 PHOTO OFF TERRAIN QA: PASS',{
  probe:{x,z,groundY,refinedY,normalDot:actual.dot(expected)},
  appearanceRuns:diagnostics.photoOffAppearanceRuns,
  adjustedVertices:diagnostics.photoOffAppearanceAdjustedVertices,
  geometryAuthority:'safety-cut preserved',
  appearanceAuthority:'natural DEM normals'
});

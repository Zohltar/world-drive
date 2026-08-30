import assert from 'node:assert/strict';
import {createRoadGeometrySystem} from '../src/road-geometry.js';

const terrainAbs=(x,z)=>100+x*.01+z*.8;
const rawTerrainCrossSlopeDeg=Math.atan2(terrainAbs(150,5.6)-terrainAbs(150,-5.6),11.2)*180/Math.PI;
assert.ok(rawTerrainCrossSlopeDeg>30,'test setup must provide an extreme terrain cross-slope');

const segment={ax:0,az:0,bx:300,bz:0,len:300,cum:0};
const state={absX:150,absZ:0,routeLength:300,segments:[segment],worldOffset:{x:0,z:0}};
const noBridge=()=>null;
const bridgeManager={isNearApproach(){return false;}};
const nearestRoute=(x,z)=>({cum:Math.max(0,Math.min(300,x)),px:x,pz:0,d:Math.abs(z),angle:Math.PI/2,i:0,t:x/300});

const road=createRoadGeometrySystem({
  THREE:{},
  roadEdgeMat:null,
  roadUnderMat:null,
  ROAD_SURFACE_OFFSET:0,
  terrainAbs,
  nearestRoute,
  bridgeHeightAtCum:noBridge,
  bridgeManager,
  getState:()=>state
});
const profile=road.buildProfile();
assert.ok(profile.length>50,'active road builder should create a dense profile');
assert.ok(profile.every(p=>Number.isFinite(p.y)&&Number.isFinite(p.roll)),'active profile must remain finite');

const maxBankDeg=Math.max(...profile.map(p=>Math.abs(p.roll||0)))*180/Math.PI;
assert.ok(maxBankDeg<=1.0001,`straight road must clamp terrain-derived crossfall to 1 degree, got ${maxBankDeg.toFixed(3)}°`);
const settled=profile.filter(p=>p.cum>140);
assert.ok(settled.some(p=>Math.abs((p.roll||0)*180/Math.PI)>.9),'straight-road crossfall should retain only the bounded 1 degree hint, not erase it accidentally');

const mid=profile[Math.floor(profile.length/2)];
const terrainMid=terrainAbs(mid.x,mid.z);
assert.ok(Math.abs(mid.y-terrainMid)<3.5,'road height should still follow the active terrain profile while banking authority is bounded');

console.log('V21.31 active terrain authority QA passed',{rawTerrainCrossSlopeDeg,maxBankDeg});

import assert from 'node:assert/strict';
import { smoothRoadProfileV21_31 } from '../src/road-geometry-v21.31.js';

const noopBridge={isNearApproach(){return false;}};
const noBridge=()=>null;
const flat=()=>0;

const corner=[];
for(let i=0;i<8;i++)corner.push({x:i*3,z:0,y:0,cum:i*3,roll:0});
for(let i=1;i<9;i++)corner.push({x:21,z:i*3,y:0,cum:21+i*3,roll:0});
const curved=smoothRoadProfileV21_31(corner,{terrainAbs:flat,bridgeHeightAtCum:noBridge,bridgeManager:noopBridge});
const apex=curved[7];
const drift=Math.hypot(apex.x-corner[7].x,apex.z-corner[7].z);
assert(drift>0.05,'90-degree routing vertex should be rounded');
assert(drift<=1.350001,'horizontal smoothing must stay inside bounded corridor');
assert.deepEqual(curved[0],corner[0],'first endpoint must remain fixed');
assert.deepEqual(curved.at(-1),corner.at(-1),'last endpoint must remain fixed');

const crest=[];
for(let i=0;i<25;i++){
  const d=i*3;
  const y=i<12?i*1.2:(24-i)*1.2;
  crest.push({x:d,z:0,y,cum:d,roll:0});
}
const rounded=smoothRoadProfileV21_31(crest,{terrainAbs:()=>20,bridgeHeightAtCum:noBridge,bridgeManager:noopBridge});
const oldSlopeIn=crest[12].y-crest[11].y;
const oldSlopeOut=crest[13].y-crest[12].y;
const newSlopeIn=rounded[12].y-rounded[11].y;
const newSlopeOut=rounded[13].y-rounded[12].y;
assert(Math.abs(newSlopeIn-newSlopeOut)<Math.abs(oldSlopeIn-oldSlopeOut),'crest slope reversal should be smoother');

console.log('V21.31 road smoothing QA passed');

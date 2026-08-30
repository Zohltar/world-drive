import assert from 'node:assert/strict';
import {smoothRoadProfileV21_31} from '../src/road-geometry.js';

const noopBridge={isNearApproach(){return false;}};
const noBridge=()=>null;

const corner=[];
for(let i=0;i<8;i++)corner.push({x:i*3,z:0,y:0,cum:500+i*3,roll:0});
for(let i=1;i<9;i++)corner.push({x:21,z:i*3,y:0,cum:521+i*3,roll:0});
const curved=smoothRoadProfileV21_31(corner,{bridgeHeightAtCum:noBridge,bridgeManager:noopBridge});
const apex=curved[7];
const drift=Math.hypot(apex.x-corner[7].x,apex.z-corner[7].z);
assert(drift>0.05,'90-degree routing vertex should be rounded');
assert(drift<=1.350001,'horizontal smoothing must stay inside bounded corridor');
assert.equal(curved[0].x,corner[0].x,'first endpoint X must remain fixed');
assert.equal(curved[0].z,corner[0].z,'first endpoint Z must remain fixed');
assert.equal(curved.at(-1).x,corner.at(-1).x,'last endpoint X must remain fixed');
assert.equal(curved.at(-1).z,corner.at(-1).z,'last endpoint Z must remain fixed');

const crest=[];
for(let i=0;i<25;i++){
  const d=i*3;
  const y=i<12?i*1.2:(24-i)*1.2;
  crest.push({x:d,z:0,y,cum:500+d,roll:0});
}
const rounded=smoothRoadProfileV21_31(crest,{bridgeHeightAtCum:noBridge,bridgeManager:noopBridge});
const oldSlopeIn=crest[12].y-crest[11].y;
const oldSlopeOut=crest[13].y-crest[12].y;
const newSlopeIn=rounded[12].y-rounded[11].y;
const newSlopeOut=rounded[13].y-rounded[12].y;
assert(Math.abs(newSlopeIn-newSlopeOut)<Math.abs(oldSlopeIn-oldSlopeOut),'crest slope reversal should be smoother');
assert(rounded.every(p=>Number.isFinite(p.y)&&Number.isFinite(p.roll)),'active road smoothing must remain finite');

console.log('V21.31 active road smoothing QA passed',{cornerDriftM:drift});

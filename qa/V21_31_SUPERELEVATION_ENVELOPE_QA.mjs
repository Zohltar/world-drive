import assert from 'node:assert/strict';
import { applyRoadSuperelevationV21_31 } from '../src/road-geometry-v21.31.js';

function arcProfile(radius,arcLength,step=3){
  const points=[];
  const count=Math.max(3,Math.ceil(arcLength/step));
  for(let i=0;i<=count;i++){
    const s=Math.min(arcLength,i*step);
    const a=s/radius;
    points.push({
      x:radius*(1-Math.cos(a)),
      z:radius*Math.sin(a),
      y:0,
      cum:s,
      roll:0
    });
  }
  return points;
}

function maxBankDeg(profile){
  const banked=applyRoadSuperelevationV21_31(profile);
  return Math.max(...banked.map(p=>Math.abs(p.roll||0)))*180/Math.PI;
}

const tight=maxBankDeg(arcProfile(100,90));
const medium=maxBankDeg(arcProfile(180,120));
const flowing=maxBankDeg(arcProfile(400,180));
const broad=maxBankDeg(arcProfile(700,240));

assert(tight<0.12,`100 m radius bend should remain effectively flat, got ${tight.toFixed(3)} deg`);
assert(medium<0.65,`180 m radius bend should only receive a trace of bank, got ${medium.toFixed(3)} deg`);
assert(flowing>0.35&&flowing<=1.75,`400 m sustained bend should receive subtle banking, got ${flowing.toFixed(3)} deg`);
assert(broad<=1.75,`all public-road banking must remain <=1.75 deg, got ${broad.toFixed(3)} deg`);

const straight=Array.from({length:100},(_,i)=>({x:0,z:i*3,y:0,cum:i*3,roll:.2}));
const straightBanked=applyRoadSuperelevationV21_31(straight);
assert(straightBanked.every(p=>Math.abs(p.roll||0)<1e-9),'straight road must be exactly flat crosswise');

console.log({tight,medium,flowing,broad});
console.log('V21.31 subtle superelevation envelope QA passed');

import assert from 'node:assert/strict';
import {engineerRoadBankingV21_31} from '../src/road-geometry.js';

function makeStraight(n=120,step=3,roll=.2){
  return Array.from({length:n},(_,i)=>({x:0,z:i*step,y:0,cum:500+i*step,roll}));
}
function makeArc(radius,arcLength,step=3,direction=1){
  const n=Math.max(24,Math.ceil(arcLength/step));
  return Array.from({length:n+1},(_,i)=>{
    const s=Math.min(arcLength,i*step),a=s/radius;
    return {x:direction*radius*(1-Math.cos(a)),z:radius*Math.sin(a),y:0,cum:500+s,roll:0};
  });
}
function peakBankDeg(profile){
  const banked=engineerRoadBankingV21_31(profile);
  return Math.max(...banked.map(p=>Math.abs(p.roll||0)))*180/Math.PI;
}

const straight=engineerRoadBankingV21_31(makeStraight());
const straightPeak=Math.max(...straight.map(p=>Math.abs(p.roll||0)))*180/Math.PI;
assert.ok(straightPeak<=1.0001,'straight-road terrain crossfall must stay bounded to 1 degree');
assert.ok(straightPeak>=.99,'active straight-road crossfall clamp should remain effective');

const tight=peakBankDeg(makeArc(100,180));
const medium=peakBankDeg(makeArc(180,220));
const flowing=peakBankDeg(makeArc(400,320));
assert.ok(tight>=5.5&&tight<=6.0001,`100 m curve should approach the 6 degree cap, got ${tight.toFixed(3)}°`);
assert.ok(medium>=3.4&&medium<=4.3,`180 m curve should receive about 4 degrees, got ${medium.toFixed(3)}°`);
assert.ok(flowing>=1.6&&flowing<=2.3,`400 m curve should receive about 2 degrees, got ${flowing.toFixed(3)}°`);
assert.ok(tight>medium&&medium>flowing,'banking should reduce as curve radius increases');

const left=engineerRoadBankingV21_31(makeArc(400,320,3,1));
const right=engineerRoadBankingV21_31(makeArc(400,320,3,-1));
const leftMid=left[Math.floor(left.length/2)].roll;
const rightMid=right[Math.floor(right.length/2)].roll;
assert.ok(leftMid*rightMid<0,'mirrored curves must receive opposite bank signs');

let maxStep=0;
for(let i=1;i<left.length;i++)maxStep=Math.max(maxStep,Math.abs(left[i].roll-left[i-1].roll));
assert.ok(maxStep<.02,'bank transitions must remain gradual');

console.log('V21.31 active engineered banking QA passed',{straightPeak,tight,medium,flowing,maxStepDeg:maxStep*180/Math.PI});

import assert from 'node:assert/strict';
import {engineerRoadBankingV21_31,clampRoadBankV21_31} from '../src/road-geometry.js';

const rad=deg=>deg*Math.PI/180;
const deg=value=>value*180/Math.PI;

function makeArc(radius,arcLength,{left=false,rawRollDeg=0,step=3,startCum=500}={}){
  const n=Math.max(40,Math.ceil(arcLength/step));
  return Array.from({length:n+1},(_,i)=>{
    const s=Math.min(arcLength,i*step),a=s/radius;
    const side=left?-1:1;
    return {
      x:side*radius*(1-Math.cos(a)),
      z:radius*Math.sin(a),
      y:100,
      cum:startCum+s,
      roll:rad(rawRollDeg)
    };
  });
}

function makeStraight(n=140,{rawRollDeg=0,step=3,startCum=500}={}){
  return Array.from({length:n},(_,i)=>({x:0,z:i*step,y:100,cum:startCum+i*step,roll:rad(rawRollDeg)}));
}

function core(profile,edge=22){return profile.slice(edge,-edge);}
function maxAbsStepDeg(profile){
  let max=0;
  for(let i=1;i<profile.length;i++)max=Math.max(max,Math.abs(deg(profile[i].roll-profile[i-1].roll)));
  return max;
}

// Absolute safety clamp is now physically symmetric; turn direction determines sign.
assert.ok(Math.abs(deg(clampRoadBankV21_31(rad(-20)))+6)<1e-9);
assert.ok(Math.abs(deg(clampRoadBankV21_31(rad(20)))-6)<1e-9);

// Right turn: positive roll raises the outside (left) edge. Feed deliberately
// adverse terrain roll and verify the engineered curve reverses it inward.
const right=engineerRoadBankingV21_31(makeArc(500,330,{rawRollDeg:-5}));
const rightCore=core(right);
assert.ok(rightCore.length>20,'right-curve core must be populated');
assert.ok(rightCore.every(p=>p.roll>=-1e-12),'persistent right curve must never bank outward');
assert.ok(Math.max(...rightCore.map(p=>deg(p.roll)))>=1.0,'long R500 right curve should receive useful inward banking');
assert.ok(Math.max(...rightCore.map(p=>deg(p.roll)))<=6.000001,'right curve must respect 6 deg engineered cap');

// Left turn: negative roll raises the outside (right) edge. Again start from an
// adverse terrain roll and require the final road to lean inward.
const left=engineerRoadBankingV21_31(makeArc(500,330,{left:true,rawRollDeg:5}));
const leftCore=core(left);
assert.ok(leftCore.every(p=>p.roll<=1e-12),'persistent left curve must never bank outward');
assert.ok(Math.min(...leftCore.map(p=>deg(p.roll)))<=-1.0,'long R500 left curve should receive useful inward banking');
assert.ok(Math.min(...leftCore.map(p=>deg(p.roll)))>=-6.000001,'left curve must respect -6 deg engineered cap');

// Tight mountain bend should gain stronger banking but remain road-like rather
// than following arbitrary terrain tilt.
const tight=engineerRoadBankingV21_31(makeArc(150,180,{rawRollDeg:-12}));
const tightCore=core(tight,16);
const tightMax=Math.max(...tightCore.map(p=>deg(p.roll)));
assert.ok(tightMax>=3.5&&tightMax<=6.000001,`tight curve banking should be 3.5..6 deg, got ${tightMax.toFixed(3)}`);

// A straight road cannot inherit a large mountain-side lean. The one-plane road
// model retains at most a small drainage-like crossfall.
const straight=engineerRoadBankingV21_31(makeStraight(140,{rawRollDeg:12}));
assert.ok(straight.every(p=>Math.abs(deg(p.roll))<=1.000001),'straight crossfall must remain within +/-1 deg');

// Banking transitions should be gradual enough not to kick the vehicle laterally.
assert.ok(maxAbsStepDeg(right)<.55,`right banking transition too abrupt: ${maxAbsStepDeg(right).toFixed(3)} deg/sample`);
assert.ok(maxAbsStepDeg(left)<.55,`left banking transition too abrupt: ${maxAbsStepDeg(left).toFixed(3)} deg/sample`);

console.log('PASS Road R2 realistic banking');
console.log('  - persistent curves never bank toward the outside');
console.log('  - banking magnitude follows curvature and caps at +/-6 deg');
console.log('  - straight terrain-driven crossfall is limited to +/-1 deg');
console.log('  - banking transitions remain gradual');

import assert from 'node:assert/strict';
import {applyRoadSuperelevationV21_31} from '../src/road-geometry-v21.31.js';

function makeStraight(n=100,step=3){return Array.from({length:n},(_,i)=>({x:0,z:i*step,y:0,cum:i*step,roll:.2}));}
function makeArc(radius,arcLength,step=3){
  const n=Math.max(12,Math.ceil(arcLength/step));
  return Array.from({length:n+1},(_,i)=>{
    const s=Math.min(arcLength,i*step),a=s/radius;
    return {x:radius*(1-Math.cos(a)),z:radius*Math.sin(a),y:0,cum:s,roll:0};
  });
}
function maxBankDeg(profile){return Math.max(...applyRoadSuperelevationV21_31(profile).map(p=>Math.abs(p.roll||0)))*180/Math.PI;}

const straight=applyRoadSuperelevationV21_31(makeStraight());
assert.ok(straight.every(p=>Math.abs(p.roll)<1e-9),'straight road must stay exactly flat crosswise');

const medium=maxBankDeg(makeArc(180,120));
const flowing=maxBankDeg(makeArc(400,180));
const hairpin=maxBankDeg(makeArc(100,90));
assert.ok(hairpin<.12,`tight bend should remain effectively flat, got ${hairpin.toFixed(3)}°`);
assert.ok(medium<.65,`180 m curve should only receive trace banking, got ${medium.toFixed(3)}°`);
assert.ok(flowing>.35&&flowing<=1.75,`long flowing curve should receive subtle bank, got ${flowing.toFixed(3)}°`);

const banked=applyRoadSuperelevationV21_31(makeArc(400,180));
let maxStep=0;
for(let i=1;i<banked.length;i++)maxStep=Math.max(maxStep,Math.abs(banked[i].roll-banked[i-1].roll));
assert.ok(maxStep<.012,'bank transitions must remain gradual');

console.log('V21.31 superelevation QA passed',{hairpin,medium,flowing});

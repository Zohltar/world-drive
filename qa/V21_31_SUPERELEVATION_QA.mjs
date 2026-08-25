import assert from 'node:assert/strict';
import { applyRoadSuperelevationV21_31 } from '../src/road-geometry-v21.31.js';

function makeStraight(n=80,step=3){
  return Array.from({length:n},(_,i)=>({x:0,z:i*step,y:0,cum:i*step,roll:0}));
}

const straight=applyRoadSuperelevationV21_31(makeStraight());
assert(straight.every(p=>Math.abs(p.roll)<1e-9),'straight road must stay at zero bank');

function makeArc(radius,arcDeg,step=3){
  const arc=arcDeg*Math.PI/180;
  const length=radius*arc;
  const n=Math.max(12,Math.ceil(length/step));
  const pts=[];
  for(let i=0;i<=n;i++){
    const a=arc*i/n;
    pts.push({x:radius*(1-Math.cos(a)),z:radius*Math.sin(a),y:0,cum:length*i/n,roll:0});
  }
  return pts;
}

const flowing=applyRoadSuperelevationV21_31(makeArc(180,55));
const flowMax=Math.max(...flowing.map(p=>Math.abs(p.roll)));
assert(flowMax>0.008,'long flowing curve should receive visible superelevation');
assert(flowMax<=4*Math.PI/180+1e-9,'public-road bank must stay <= 4 degrees');

const hairpin=applyRoadSuperelevationV21_31(makeArc(24,120));
const hairpinMax=Math.max(...hairpin.map(p=>Math.abs(p.roll)));
assert(hairpinMax<0.01,'tight low-speed hairpin should remain nearly flat');

let maxStep=0;
for(let i=1;i<flowing.length;i++)maxStep=Math.max(maxStep,Math.abs(flowing[i].roll-flowing[i-1].roll));
assert(maxStep<0.012,'bank transitions must be gradual');

console.log('V21.31 superelevation QA passed');

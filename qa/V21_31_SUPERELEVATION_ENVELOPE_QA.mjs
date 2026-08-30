import assert from 'node:assert/strict';
import {engineerRoadBankingV21_31} from '../src/road-geometry.js';

function arcProfile(radius,arcLength,step=3){
  const points=[];
  const count=Math.max(24,Math.ceil(arcLength/step));
  for(let i=0;i<=count;i++){
    const s=Math.min(arcLength,i*step);
    const a=s/radius;
    points.push({x:radius*(1-Math.cos(a)),z:radius*Math.sin(a),y:0,cum:500+s,roll:0});
  }
  return points;
}
function maxBankDeg(profile){
  const banked=engineerRoadBankingV21_31(profile);
  return Math.max(...banked.map(p=>Math.abs(p.roll||0)))*180/Math.PI;
}

const samples=[
  [100,180],[180,220],[250,260],[400,320],[500,360],[700,420],[1000,500],[2000,700]
].map(([radius,length])=>({radius,bank:maxBankDeg(arcProfile(radius,length))}));

for(const sample of samples){
  assert.ok(sample.bank>=0&&sample.bank<=6.0001,`R=${sample.radius}: bank outside 0..6 degree envelope`);
}
for(let i=1;i<samples.length;i++){
  assert.ok(samples[i].bank<=samples[i-1].bank+.02,`banking should not increase with radius: R=${samples[i-1].radius} -> R=${samples[i].radius}`);
}

function near(radius,target,tolerance){
  const value=samples.find(s=>s.radius===radius).bank;
  assert.ok(Math.abs(value-target)<=tolerance,`R=${radius}: expected about ${target}°, got ${value.toFixed(3)}°`);
}
near(100,6,.05);
near(250,2.95,.20);
near(500,1.65,.15);
near(1000,1.00,.12);
near(2000,.675,.10);

console.table(samples.map(s=>({radius_m:s.radius,max_bank_deg:+s.bank.toFixed(3)})));
console.log('V21.31 active superelevation envelope QA passed');

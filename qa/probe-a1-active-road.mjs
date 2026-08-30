import {engineerRoadBankingV21_31,smoothRoadProfileV21_31} from '../src/road-geometry.js';

function arcProfile(radius,arcLength,step=3,cumOffset=500){
  const points=[];
  const count=Math.max(3,Math.ceil(arcLength/step));
  for(let i=0;i<=count;i++){
    const s=Math.min(arcLength,i*step);
    const a=s/radius;
    points.push({x:radius*(1-Math.cos(a)),z:radius*Math.sin(a),y:0,cum:cumOffset+s,roll:0});
  }
  return points;
}
function bankStats(profile){
  const banked=engineerRoadBankingV21_31(profile);
  const deg=banked.map(p=>(p.roll||0)*180/Math.PI);
  return {min:Math.min(...deg),max:Math.max(...deg),peak:Math.max(...deg.map(Math.abs)),mid:deg[Math.floor(deg.length/2)]};
}
for(const [radius,length] of [[100,180],[180,220],[250,260],[400,320],[500,360],[700,420],[1000,500],[2000,700]]){
  console.log('ARC',radius,bankStats(arcProfile(radius,length)));
}
const straight=Array.from({length:120},(_,i)=>({x:0,z:i*3,y:0,cum:500+i*3,roll:8*Math.PI/180}));
console.log('STRAIGHT',bankStats(straight));

const corner=[];
for(let i=0;i<8;i++)corner.push({x:i*3,z:0,y:0,cum:500+i*3,roll:0});
for(let i=1;i<9;i++)corner.push({x:21,z:i*3,y:0,cum:521+i*3,roll:0});
const curved=smoothRoadProfileV21_31(corner,{terrainAbs:()=>0,bridgeHeightAtCum:()=>null,bridgeManager:{isNearApproach(){return false;}}});
const apex=curved[7];
console.log('CORNER_DRIFT',Math.hypot(apex.x-corner[7].x,apex.z-corner[7].z));

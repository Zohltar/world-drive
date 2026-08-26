import {
  FOREST_STREAMING_POLICY as P8,
  forestHash,
  forestDensityNoise,
  forestKeepProbability,
  forestLodForDistance,
  forestCellRange
} from '../src/forest-streaming-policy.js';

const P7={...P8,nearDistance:360};
const TRI={authored:1888,ps1:1180,scene:264,proxyMid:68,proxyFar:20};

function variantTrianglesP7(lod,r){
  if(lod===2)return TRI.scene;
  if(lod===1)return r<.24?TRI.ps1:TRI.scene;
  if(r<.15)return TRI.authored;
  if(r<.62)return TRI.ps1;
  return TRI.scene;
}

function variantTrianglesP8(lod,r){
  if(lod===2)return TRI.proxyFar;
  if(lod===1)return TRI.proxyMid;
  if(r<.13)return TRI.authored;
  if(r<.61)return TRI.ps1;
  return TRI.scene;
}

function simulate(policy,triangleFn){
  const counts=[0,0,0];
  let triangles=0;
  const cells=forestCellRange(0,0,policy);
  for(const cell of cells){
    const baseDensity=forestDensityNoise(cell.x,cell.z);
    for(let i=0;i<policy.candidatesPerCell;i++){
      const rx=forestHash(cell.cx,cell.cz,17+i*7919);
      const rz=forestHash(cell.cx,cell.cz,31+i*104729);
      const x=(cell.cx+rx)*policy.cellSize;
      const z=(cell.cz+rz)*policy.cellSize;
      const distance=Math.hypot(x,z);
      const lod=forestLodForDistance(distance,policy);
      if(lod<0)continue;
      const keep=forestKeepProbability(distance,baseDensity,policy);
      if(forestHash(cell.cx,cell.cz,(0x51f15e+Math.imul(i,0x9e3779b1))|0)>keep)continue;
      const r=forestHash(cell.cx,cell.cz,(0x73a2d1+Math.imul(i,2246822519))|0);
      counts[lod]++;
      triangles+=triangleFn(lod,r);
    }
  }
  return {counts,total:counts.reduce((a,b)=>a+b,0),triangles};
}

const oldBudget=simulate(P7,variantTrianglesP7);
const newBudget=simulate(P8,variantTrianglesP8);
const ratio=newBudget.triangles/oldBudget.triangles;

console.log('P7 theoretical forest:',oldBudget);
console.log('P8 theoretical forest:',newBudget);
console.log(`Triangle ratio P8/P7: ${(ratio*100).toFixed(1)}%`);

if(P8.nearDistance>320)throw new Error('P8 authored-tree radius regressed');
if(TRI.proxyMid>80)throw new Error('Mid proxy exceeds 80-triangle budget');
if(TRI.proxyFar>24)throw new Error('Far proxy exceeds 24-triangle budget');
if(ratio>.30)throw new Error(`P8 forest triangle budget regression: ${(ratio*100).toFixed(1)}% of P7`);

console.log('FOREST_P8_BUDGET_QA: PASS');

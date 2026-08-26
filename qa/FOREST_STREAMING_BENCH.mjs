import {
  FOREST_STREAMING_POLICY as P,
  forestHash,
  forestDensityNoise,
  forestKeepProbability,
  forestLodForDistance,
  forestSectorForOffset,
  forestCellRange
} from '../src/forest-streaming-policy.js';

function simulate(centerX=0,centerZ=0){
  const counts=[0,0,0];
  const sectors=Array.from({length:3},()=>Array(P.sectors).fill(0));
  let candidates=0;
  for(const cell of forestCellRange(centerX,centerZ,P)){
    const density=forestDensityNoise(cell.x,cell.z);
    for(let i=0;i<P.candidatesPerCell;i++){
      const rx=forestHash(cell.cx,cell.cz,17+i*7919);
      const rz=forestHash(cell.cx,cell.cz,31+i*104729);
      const x=(cell.cx+rx)*P.cellSize,z=(cell.cz+rz)*P.cellSize;
      const dx=x-centerX,dz=z-centerZ,d=Math.hypot(dx,dz);
      if(d>=P.maxDistance)continue;
      candidates++;
      const keep=forestKeepProbability(d,density,P);
      if(forestHash(cell.cx,cell.cz,0x51f15e+i*2654435761)>keep)continue;
      const lod=forestLodForDistance(d,P);
      counts[lod]++;
      sectors[lod][forestSectorForOffset(dx,dz,P.sectors)]++;
    }
  }
  return {counts,total:counts.reduce((a,b)=>a+b,0),candidates,sectors};
}

const samples=[[0,0],[520,0],[1040,240],[-760,930]].map(([x,z])=>simulate(x,z));
const avg=samples.reduce((acc,s)=>acc.map((v,i)=>v+s.counts[i]),[0,0,0]).map(v=>Math.round(v/samples.length));
const total=avg.reduce((a,b)=>a+b,0);
const avgTrisNear=.15*1888+.47*1180+.38*264;
const avgTrisMid=.24*1180+.76*264;
const triangles=Math.round(avg[0]*avgTrisNear+avg[1]*avgTrisMid+avg[2]*264);
const maxDrawCalls=P.sectors*(4+2+1);
const overlap=P.maxDistance-520;

console.log(JSON.stringify({
  policy:P,
  averageTrees:{near:avg[0],mid:avg[1],far:avg[2],total},
  triangleBudgetAllVisible:triangles,
  maxForestDrawCalls:maxDrawCalls,
  overlapAfterSoftRecenter:overlap,
  samples:samples.map(s=>s.counts)
},null,2));

if(overlap<1000)throw new Error('Forest overlap after soft recenter is too small');
if(total<5500)throw new Error('Forest density target too low');
if(triangles>4500000)throw new Error('Forest triangle budget too high');
if(maxDrawCalls>64)throw new Error('Forest draw-call budget too high');

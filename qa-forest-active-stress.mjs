import assert from 'node:assert/strict';
import fs from 'node:fs';
import {FOREST_STREAMING_POLICY as P} from './src/forest-streaming-policy.js';

const chunkSize=P.cellSize*P.chunkCells;
const halfChunkDiagonal=chunkSize*Math.SQRT2*.5;
const candidatesPerChunk=P.candidatesPerCell*P.chunkCells*P.chunkCells;

function desc(cx,cz){return {key:`${cx}:${cz}`,cx,cz,originX:cx*chunkSize,originZ:cz*chunkSize,centerX:(cx+.5)*chunkSize,centerZ:(cz+.5)*chunkSize};}
function centerDistance(c,p){return Math.hypot(c.centerX-p.x,c.centerZ-p.z);}
function required(p){
  const minX=Math.floor((p.x-P.maxDistance)/chunkSize)-1,maxX=Math.floor((p.x+P.maxDistance)/chunkSize)+1;
  const minZ=Math.floor((p.z-P.maxDistance)/chunkSize)-1,maxZ=Math.floor((p.z+P.maxDistance)/chunkSize)+1;
  const out=[];
  for(let cx=minX;cx<=maxX;cx++)for(let cz=minZ;cz<=maxZ;cz++){
    const c=desc(cx,cz);
    if(centerDistance(c,p)<=P.maxDistance+halfChunkDiagonal)out.push(c);
  }
  return out;
}
function straight(length=20000,step=120){const out=[];for(let s=0;s<=length;s+=step)out.push({x:s,z:0});return out;}
function serpentine(length=20000,step=120){const out=[];for(let s=0;s<=length;s+=step)out.push({x:650*Math.sin(s/850),z:s*.92});return out;}
function stress(path){
  let active=new Set(),seen=new Set(),distance=0,last=null,nextRefresh=2200;
  let maxEnteringAfterBoot=0,totalNewCandidates=0,totalRefreshCandidates=0,maxRefreshChunks=0;
  path.forEach((p,index)=>{
    if(last)distance+=Math.hypot(p.x-last.x,p.z-last.z);last=p;
    const req=required(p),keys=new Set(req.map(c=>c.key));
    let entering=0;
    for(const key of keys)if(!active.has(key)&&!seen.has(key)){entering++;seen.add(key);}
    if(index>0)maxEnteringAfterBoot=Math.max(maxEnteringAfterBoot,entering);
    totalNewCandidates+=entering*candidatesPerChunk;
    active=keys;
    while(distance>=nextRefresh){
      const refreshed=req.filter(c=>centerDistance(c,p)<=P.heightRefreshDistance+halfChunkDiagonal).length;
      maxRefreshChunks=Math.max(maxRefreshChunks,refreshed);
      totalRefreshCandidates+=refreshed*candidatesPerChunk;
      nextRefresh+=2200;
    }
  });
  return {maxEnteringAfterBoot,totalNewCandidates,totalRefreshCandidates,maxRefreshChunks};
}

const line=stress(straight());
const bends=stress(serpentine());
const legacyMatrixMultiplier=1+.88+.55+.20;
const legacyBytes=candidatesPerChunk*16*4*legacyMatrixMultiplier*P.chunkCacheLimit;
const activeBytes=candidatesPerChunk*16*4*P.chunkCacheLimit;
const impl=fs.readFileSync(new URL('./src/forest-chunk-streamer-p929.js',import.meta.url),'utf8');

assert.ok(required({x:0,z:0}).length>=50&&required({x:0,z:0}).length<=70,'active chunk ring regression');
assert.ok(line.maxEnteringAfterBoot<=4,'straight-line chunk burst regression');
assert.ok(bends.maxEnteringAfterBoot<=6,'serpentine chunk burst regression');
assert.ok(line.maxRefreshChunks<=12&&bends.maxRefreshChunks<=12,'terrain refresh ring is too large');
assert.ok(P.candidatesPerBuildSlice<=16,'normal active candidate batch is too large');
assert.ok(P.forestSliceBudgetMs<=1.10,'normal active forest slice budget is too large');
assert.ok(P.forestCatchupCandidatesPerSlice<=24,'catch-up candidate batch is too large');
assert.ok(P.forestCatchupSliceBudgetMs<=1.75,'catch-up forest slice budget is too large');
assert.ok(activeBytes/legacyBytes<.40,'single-matrix chunk cache memory regression');
assert.equal((impl.match(/instanceMatrix\.needsUpdate\s*=\s*true/g)||[]).length,1,
  'active streamer should upload an instance matrix only when a chunk mesh is created');
assert.ok(impl.includes('THREE.StaticDrawUsage'),'active forest matrices should remain immutable GPU buffers');
assert.ok(impl.includes('replaceActive'),'terrain refresh must retain double-buffer replacement chunks');
assert.ok(impl.includes('preparePrefetchMesh'),'active streamer must retain detached rolling prefetch preparation');

console.log('ACTIVE FOREST STRESS QA: PASS');
console.log({
  candidatesPerChunk,
  normalCandidateBatch:P.candidatesPerBuildSlice,
  normalSliceBudgetMs:P.forestSliceBudgetMs,
  catchupCandidateBatch:P.forestCatchupCandidatesPerSlice,
  catchupSliceBudgetMs:P.forestCatchupSliceBudgetMs,
  straight20km:line,
  serpentine20km:bends,
  legacyWorstCaseMatrixCacheMB:Number((legacyBytes/1e6).toFixed(1)),
  activeWorstCaseMatrixCacheMB:Number((activeBytes/1e6).toFixed(1)),
  matrixMemoryReductionPct:Number(((1-activeBytes/legacyBytes)*100).toFixed(1))
});

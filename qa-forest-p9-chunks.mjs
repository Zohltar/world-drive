import assert from 'node:assert/strict';
import {FOREST_STREAMING_POLICY as P} from './src/forest-streaming-policy.js';

const cellHalf=P.cellSize*Math.SQRT2*.5;
function legacyCells(cx,cz){
  const minX=Math.floor((cx-P.maxDistance)/P.cellSize)-1;
  const maxX=Math.floor((cx+P.maxDistance)/P.cellSize)+1;
  const minZ=Math.floor((cz-P.maxDistance)/P.cellSize)-1;
  const maxZ=Math.floor((cz+P.maxDistance)/P.cellSize)+1;
  let count=0;
  for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
    const wx=(x+.5)*P.cellSize,wz=(z+.5)*P.cellSize;
    if(Math.hypot(wx-cx,wz-cz)<=P.maxDistance+cellHalf)count++;
  }
  return count;
}

const chunkCells=P.chunkCells||4;
const chunkSize=P.cellSize*chunkCells;
const chunkHalf=chunkSize*Math.SQRT2*.5;
function chunkKeys(cx,cz){
  const minX=Math.floor((cx-P.maxDistance)/chunkSize)-1;
  const maxX=Math.floor((cx+P.maxDistance)/chunkSize)+1;
  const minZ=Math.floor((cz-P.maxDistance)/chunkSize)-1;
  const maxZ=Math.floor((cz+P.maxDistance)/chunkSize)+1;
  const keys=new Set();
  for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
    const wx=(x+.5)*chunkSize,wz=(z+.5)*chunkSize;
    if(Math.hypot(wx-cx,wz-cz)<=P.maxDistance+chunkHalf)keys.add(`${x}:${z}`);
  }
  return keys;
}

const legacy=legacyCells(0,0);
const a=chunkKeys(0,0);
const b=chunkKeys(chunkSize,0);
const entering=[...b].filter(key=>!a.has(key)).length;
const legacyCandidateWork=legacy*P.candidatesPerCell;
const incrementalCandidateWork=entering*chunkCells*chunkCells*P.candidatesPerCell;
const ratio=incrementalCandidateWork/legacyCandidateWork;

assert.ok(a.size>=40&&a.size<=80,`unexpected active chunk count: ${a.size}`);
assert.ok(entering>0&&entering<20,`unexpected entering chunk count: ${entering}`);
assert.ok(ratio<.25,`P9 incremental work regression: ${(ratio*100).toFixed(1)}% of legacy rebuild`);
assert.ok((P.chunkCacheLimit||0)>a.size,'chunk cache must retain at least one active forest ring');

console.log('Foret P9 chunk QA passed');
console.log({
  legacyCells:legacy,
  legacyCandidateWork,
  activeChunks:a.size,
  enteringChunksAfterOneChunkMove:entering,
  incrementalCandidateWork,
  percentOfLegacy:Number((ratio*100).toFixed(1))
});

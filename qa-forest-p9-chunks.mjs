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

function priorityDistance(cx,cz,centerX,centerZ){
  const minX=cx*chunkSize,maxX=minX+chunkSize;
  const minZ=cz*chunkSize,maxZ=minZ+chunkSize;
  const dx=centerX<minX?minX-centerX:(centerX>maxX?centerX-maxX:0);
  const dz=centerZ<minZ?minZ-centerZ:(centerZ>maxZ?centerZ-maxZ:0);
  return Math.hypot(dx,dz);
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

// P9.1: priority follows distance to the actual chunk footprint. The chunk
// underneath the vehicle must therefore be generated before adjacent chunks,
// even when the vehicle is almost at its corner.
const focusX=chunkSize-1,focusZ=chunkSize-1;
const priorityCases=[
  {key:'0:0',d:priorityDistance(0,0,focusX,focusZ)},
  {key:'1:0',d:priorityDistance(1,0,focusX,focusZ)},
  {key:'0:1',d:priorityDistance(0,1,focusX,focusZ)},
  {key:'1:1',d:priorityDistance(1,1,focusX,focusZ)}
].sort((x,y)=>x.d-y.d);
assert.equal(priorityCases[0].key,'0:0','chunk containing the vehicle must have first build priority');
assert.equal(priorityCases[0].d,0,'vehicle chunk priority distance must be zero');
assert.ok(priorityCases.slice(1).every(item=>item.d>0),'adjacent chunks must follow the vehicle chunk');

// P9.4: terrain.js renders the roadside transition out to 16.5 + 14.0 = 30.5 m.
// Forest roots use the main terrain sampler, so they must stay outside that
// separate visual ribbon or they can appear buried/floating beside the road.
const roadTransitionOuter=16.5+14.0;
assert.ok(P.roadClearance>roadTransitionOuter,
  `forest road clearance ${P.roadClearance} m must exceed ${roadTransitionOuter} m road transition`);

console.log('Foret P9.4 chunk QA passed');
console.log({
  legacyCells:legacy,
  legacyCandidateWork,
  activeChunks:a.size,
  enteringChunksAfterOneChunkMove:entering,
  incrementalCandidateWork,
  percentOfLegacy:Number((ratio*100).toFixed(1)),
  firstChunkAtCorner:priorityCases[0],
  roadClearance:P.roadClearance,
  roadTransitionOuter
});

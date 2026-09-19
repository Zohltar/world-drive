/** Certified forest-R4 coordinates, NOT placement/visibility/density policy.
 * Full-chunk construction is explicit Worker preparation. point() is bounded
 * arithmetic; absolute cells (never render offsets) own deterministic sampling.
 */
import {FOREST_STREAMING_POLICY as FOREST, forestHash} from '../../forest-streaming-policy.js';
import {CHUNK_CONTEXT_SCHEMA, chunkContextKey} from './chunk-context-snapshot.js';

export const FOREST_LAYOUT_ID='forest-r4-120m-4x4-109-64-v1';
export const FOREST_POINT_COUNT=1744;
export const FOREST_FIRST_LAYER_COUNT=1024;
const EARTH=6378137;
const CELLS=4, PER_CELL=109, FIRST=64, SIZE=120, CHUNK=480;
const safeInt=(v,a,b)=>Number.isSafeInteger(v)&&v>=a&&v<=b;
const fail=message=>{throw new TypeError(message);};
const freeze=Object.freeze;

function assertPolicy(){
  if(FOREST.cellSize!==SIZE||FOREST.chunkCells!==CELLS||FOREST.candidatesPerCell!==PER_CELL
    ||FOREST.firstLayerCandidatesPerCell!==FIRST)fail('Forest layout changed: review adapter/version before use');
}
function address(cx,cz){
  // Every cell index must remain within the hash's signed 32-bit input domain.
  if(!safeInt(cx,-536870912,536870911)||!safeInt(cz,-536870912,536870911))fail('Invalid absolute forest chunk');
}
function index(i){if(!safeInt(i,0,FOREST_POINT_COUNT-1))fail('Invalid forest candidate index');}
function bits(value){
  const b=new DataView(new ArrayBuffer(8));b.setFloat64(0,value===0?0:value,false);
  return b.getUint32(0,false).toString(16).padStart(8,'0')+b.getUint32(4,false).toString(16).padStart(8,'0');
}
/** Natural stable slot: cellIndex * 109 + candidateIndex, NOT accepted-tree rank. */
export function forestCandidateIndex(cellIndex,candidateIndex){
  if(!safeInt(cellIndex,0,15)||!safeInt(candidateIndex,0,108))fail('Invalid forest cell/candidate');
  return cellIndex*PER_CELL+candidateIndex;
}
/** R4 visits all 16 first layers, then returns for the remaining 45/cell. */
export function forestTraversalIndex(slot){
  index(slot);const cell=Math.floor(slot/PER_CELL),i=slot%PER_CELL;
  return i<FIRST?cell*FIRST+i:FOREST_FIRST_LAYER_COUNT+cell*(PER_CELL-FIRST)+i-FIRST;
}
export function forestSlotAtTraversal(order){
  index(order);
  if(order<FOREST_FIRST_LAYER_COUNT)return Math.floor(order/FIRST)*PER_CELL+order%FIRST;
  const tail=order-FOREST_FIRST_LAYER_COUNT;
  return Math.floor(tail/(PER_CELL-FIRST))*PER_CELL+FIRST+tail%(PER_CELL-FIRST);
}
export function forestChunkAtAbsolute(x,z,target={}){
  if(!Number.isFinite(x)||!Number.isFinite(z))fail('Invalid absolute forest position');
  const cx=Math.floor(x/CHUNK),cz=Math.floor(z/CHUNK);address(cx,cz);
  target.cx=cx===0?0:cx;target.cz=cz===0?0:cz;return target;
}

export function createForestCandidateAdapter({origin,routeId}={}){
  assertPolicy();
  if(!origin||!Number.isFinite(origin.lat)||!Number.isFinite(origin.lon)
    ||Math.abs(origin.lat)>=90||Math.abs(origin.lon)>180)fail('Invalid forest projection origin');
  if(typeof routeId!=='string'||!/^[-A-Za-z0-9_.:]{1,48}$/.test(routeId))fail('Invalid forest route identity');
  const lat=origin.lat===0?0:origin.lat,lon=origin.lon===0?0:origin.lon;
  const denominator=EARTH*Math.cos(lat*Math.PI/180);
  if(Math.abs(denominator)<EARTH*1e-6)fail('Singular forest projection');
  const fixed=freeze({lat,lon});
  const projectionId=`forest7:${routeId}:${bits(lat)}:${bits(lon)}`;
  chunkContextKey(projectionId,FOREST_LAYOUT_ID,0,0);
  function project(x,z,target={}){
    if(!Number.isFinite(x)||!Number.isFinite(z))fail('Invalid absolute candidate position');
    // Keep the exact operation order of main.js xzToLL, including negative Z.
    const latitude=lat+(-z/EARTH)*180/Math.PI;
    const longitude=lon+(x/denominator)*180/Math.PI;
    // The game projection is not dateline-unwrapped. Never silently wrap/clamp.
    if(!Number.isFinite(latitude)||!Number.isFinite(longitude)
      ||Math.abs(latitude)>90||Math.abs(longitude)>180)fail('Candidate outside geographic projection domain');
    target.lon=longitude;target.lat=latitude;return target;
  }
  function point(cx,cz,slot,target={}){
    address(cx,cz);index(slot);
    const cellIndex=Math.floor(slot/PER_CELL),i=slot%PER_CELL;
    const cellCx=cx*CELLS+Math.floor(cellIndex/CELLS),cellCz=cz*CELLS+cellIndex%CELLS;
    const rx=forestHash(cellCx,cellCz,17+i*7919),rz=forestHash(cellCx,cellCz,31+i*104729);
    const x=(cellCx+rx)*SIZE,z=(cellCz+rz)*SIZE;
    project(x,z,target);
    target.x=x;target.z=z;target.cellIndex=cellIndex;target.candidateIndex=i;target.index=slot;
    return target;
  }
  function buildPoints(cx,cz){
    address(cx,cz);
    const points=new Float64Array(FOREST_POINT_COUNT*2),scratch={};
    for(let slot=0;slot<FOREST_POINT_COUNT;slot++){
      point(cx,cz,slot,scratch);points[slot*2]=scratch.lon;points[slot*2+1]=scratch.lat;
    }
    return points;
  }
  return freeze({origin:fixed,routeId,projectionId,layoutId:FOREST_LAYOUT_ID,
    count:FOREST_POINT_COUNT,firstLayerCount:FOREST_FIRST_LAYER_COUNT,project,point,buildPoints});
}
/** Bounded copy/validation only: does not generate a chunk on the calling thread. */
export function copyForestChunkRequest(request){
  const adapter=createForestCandidateAdapter({origin:request?.origin,routeId:request?.routeId});
  const {cx,cz}=request;address(cx,cz);
  if(request.schema!==CHUNK_CONTEXT_SCHEMA||request.projectionId!==adapter.projectionId
    ||request.layoutId!==FOREST_LAYOUT_ID||request.key!==chunkContextKey(adapter.projectionId,FOREST_LAYOUT_ID,cx,cz)
    ||!safeInt(request.requestId,1,Number.MAX_SAFE_INTEGER)||!safeInt(request.generation,1,Number.MAX_SAFE_INTEGER)
    ||!safeInt(request.serial,1,Number.MAX_SAFE_INTEGER))fail('Invalid procedural forest request');
  return {schema:CHUNK_CONTEXT_SCHEMA,key:request.key,requestId:request.requestId,generation:request.generation,
    serial:request.serial,cx,cz,projectionId:adapter.projectionId,layoutId:FOREST_LAYOUT_ID,
    origin:adapter.origin,routeId:adapter.routeId};
}
/** Worker-only use: same supplied-point request format already validated by R6. */
export function buildForestChunkRequest(request){
  const safe=copyForestChunkRequest(request),adapter=createForestCandidateAdapter(safe);
  return {...safe,points:adapter.buildPoints(safe.cx,safe.cz)};
}

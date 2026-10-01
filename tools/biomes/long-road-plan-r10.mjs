/** Offline authoring/test plan. Never imported by game/runtime entrypoints. */
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {createBiomeRoutePlan} from '../../src/scenery/biomes/route-tile-plan.js';
import {createForestCandidateAdapter,forestChunkAtAbsolute} from '../../src/scenery/biomes/forest-candidate-adapter.js';
export const MANIC_RESPONSE_SHA='0d3378137bf9bc3a96ffd6185bb5aaf1a6f47261e31b28038969c03425ed8e0c';
export const MANIC_RECEIPT_SHA='882039b3980d123daec53d452811c7973a37ad24aac1a6a4d26ae58d70a30724';
export const MAX_AUTHORING_TILES=512,MAX_AUTHORING_CHUNKS=2048;
const sha=raw=>createHash('sha256').update(raw).digest('hex');
export function readManicFixture(directory){
  const packed=readFileSync(path.join(directory,'response.json.gz'));
  if(packed.length>2*1024*1024)throw new RangeError('Route input byte limit');
  const raw=gunzipSync(packed,{maxOutputLength:2*1024*1024});
  if(sha(raw)!==MANIC_RESPONSE_SHA)throw new Error('Pinned real route response changed');
  const receiptRaw=readFileSync(path.join(directory,'receipt.json'));
  if(receiptRaw.length>8192||sha(receiptRaw)!==MANIC_RECEIPT_SHA)throw new Error('Pinned capture provenance changed');
  const receipt=JSON.parse(receiptRaw);
  if(receipt.responseSha256!==MANIC_RESPONSE_SHA||receipt.responseBytes!==raw.length
    ||receipt.route!=='manic2-manic5'||receipt.license!=='ODbL-1.0')throw new Error('Route provenance mismatch');
  const response=JSON.parse(raw);
  if(response.code!=='Ok'||response.routes?.[0]?.geometry?.type!=='LineString')throw new Error('Invalid real road response');
  const coordinates=response.routes[0].geometry.coordinates;
  if(coordinates.length!==receipt.pointCount)throw new Error('Route vertex count changed');
  return {coordinates,receipt};
}
export function buildLongRoadPlan(coordinates,{stepMeters=480,origin:givenOrigin}={}){
  if(!Number.isInteger(stepMeters)||stepMeters<120||stepMeters>480)throw new RangeError('Authoring step must be 120..480 m');
  const plan=createBiomeRoutePlan(coordinates);
  if(plan.totalMeters>400000||plan.totalMeters<100)throw new RangeError('Finite authoring route required');
  const origin=givenOrigin??{lon:coordinates[0][0],lat:coordinates[0][1]},routeId='manic-r10';
  const adapter=createForestCandidateAdapter({origin,routeId}),chunks=new Map(),tiles=new Map(),windows=[];
  const scale=Math.PI/180*6378137,cos=Math.cos(origin.lat*Math.PI/180);
  function at(position){
    const p=Math.min(plan.totalMeters,Math.max(0,position));let lo=0,hi=coordinates.length-2;
    while(lo<hi){const mid=Math.floor((lo+hi+1)/2);if(plan.distanceAtVertex(mid)<=p)lo=mid;else hi=mid-1;}
    const a=coordinates[lo],b=coordinates[lo+1],len=plan.distanceAtVertex(lo+1)-plan.distanceAtVertex(lo);
    const t=len?(p-plan.distanceAtVertex(lo))/len:0;
    // Match the observer's interpolation of already-projected endpoint positions.
    const ax=(a[0]-origin.lon)*scale*cos,bx=(b[0]-origin.lon)*scale*cos;
    const az=-(a[1]-origin.lat)*scale,bz=-(b[1]-origin.lat)*scale;
    return {x:ax+(bx-ax)*t,z:az+(bz-az)*t};
  }
  const positions=[];for(let p=0;p<plan.totalMeters;p+=stepMeters)positions.push(p);positions.push(plan.totalMeters);
  for(const direction of [1,-1])for(const position of direction===1?positions:[...positions].reverse()){
    const point=at(position),wanted=[],seen=new Set();
    for(const lead of [0,480,960,1440]){
      const p=lead?at(position+direction*lead):point,c=forestChunkAtAbsolute(p.x,p.z),key=`${c.cx}:${c.cz}`;
      if(seen.has(key))continue;seen.add(key);wanted.push({...c,key,role:lead?'forward':'current'});chunks.set(key,{...c,key});
    }
    const options={aheadMeters:direction===1?2400:700,behindMeters:direction===1?700:2400,corridorMeters:900,maxTiles:8};
    const coverage=plan.window(position,options);
    if(coverage.capacityLimited||coverage.planningLimited)throw new Error('Unchanged runtime window budget exceeded');
    for(const tile of coverage.tiles)tiles.set(tile.key,[tile.x,tile.y]);
    if(tiles.size>MAX_AUTHORING_TILES||chunks.size>MAX_AUTHORING_CHUNKS)throw new RangeError('Authoring inventory budget');
    windows.push({position,direction,...point,chunks:wanted,options,tileKeys:coverage.tiles.map(t=>t.key)});
  }
  return {schema:'world-drive-long-road-plan-r10',routeId,origin,coordinates,
    totalMeters:plan.totalMeters,pointCount:coordinates.length,stepMeters,
    addresses:[...tiles.values()].sort((a,b)=>a[1]-b[1]||a[0]-b[0]),chunks:[...chunks.values()],windows,
    projectionId:adapter.projectionId,placementAuthority:false,
    scope:'Entire continuous routed corridor provisioned; replay samples at most four diagnostic chunks per window; no real-time readiness certification'};
}
async function main(){
  const [mode,fixture,output]=process.argv.slice(2);
  if(!['--plan','--samples'].includes(mode)||!fixture)throw new Error('Use --plan FIXTURE OUTPUT or --samples PLAN');
  if(mode==='--plan'){
    const {coordinates,receipt}=readManicFixture(fixture),plan=buildLongRoadPlan(coordinates,{origin:{lon:receipt.requestPoints[0][0],lat:receipt.requestPoints[0][1]}});
    if(Math.abs(plan.totalMeters-receipt.lengthMeters)>.01)throw new Error('Independent route length disagreement');
    writeFileSync(output,JSON.stringify({...plan,routeProvenance:receipt})+'\n');
    console.log(JSON.stringify({pointCount:plan.pointCount,lengthMeters:plan.totalMeters,tiles:plan.addresses.length,chunks:plan.chunks.length,windows:plan.windows.length}));
  }else{
    const plan=JSON.parse(readFileSync(fixture,'utf8')),a=createForestCandidateAdapter(plan),scratch={};
    if(plan.chunks.length>MAX_AUTHORING_CHUNKS)throw new Error('Chunk authoring limit');
    for(const chunk of plan.chunks){
      const points=Array.from({length:1744},(_,i)=>{a.point(chunk.cx,chunk.cz,i,scratch);return [scratch.lon,scratch.lat];});
      if(!process.stdout.write(JSON.stringify({key:chunk.key,points})+'\n'))await once(process.stdout,'drain');
    }
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();

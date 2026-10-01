/** Exact-point chunk snapshots. No interpolation, I/O, scheduling or rendering.
 * Typed arrays are copied into private closures; freezing a facade never exposes
 * a writable backing buffer. Payload accounting is not a total JS heap bound.
 */
import {BIOME_PROFILES, biomeIdForRecord} from './biome-profiles.js';
export const CHUNK_CONTEXT_SCHEMA='world-drive-biome-chunk-v1';
export const MAX_CHUNK_POINTS=2048;
export const MAX_CHUNK_CONTEXTS=64;
export const MAX_CONTEXT_PAYLOAD=4096;
const freeze=Object.freeze;
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const label=v=>typeof v==='string'&&/^[-A-Za-z0-9_.:]{1,96}$/.test(v);
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const text=(v,max)=>typeof v==='string'&&v.length<=max;
const fail=message=>{throw new TypeError(message);};
export function snapshotIdentity(value){
  if(!label(value?.revision)||!hash(value?.catalogSha256)||!hash(value?.source?.sha256)
    ||!label(value.source.id)||!label(value.source.license))fail('Invalid snapshot dataset identity');
  return freeze({revision:value.revision,catalogSha256:value.catalogSha256,
    source:freeze({id:value.source.id,license:value.source.license,sha256:value.source.sha256})});
}
export function sameSnapshotIdentity(a,b){
  return a?.revision===b?.revision&&a?.catalogSha256===b?.catalogSha256
    &&a?.source?.id===b?.source?.id&&a?.source?.license===b?.source?.license&&a?.source?.sha256===b?.source?.sha256;
}
export function chunkContextKey(projectionId,layoutId,cx,cz){
  if(!label(projectionId)||!label(layoutId)||!integer(cx,-2147483648,2147483647)
    ||!integer(cz,-2147483648,2147483647))fail('Invalid absolute chunk address');
  return `${projectionId}|${layoutId}|${cx},${cz}`;
}
export function copyChunkPoints(points){
  if(!Array.isArray(points)||points.length<1||points.length>MAX_CHUNK_POINTS)fail('Invalid chunk point bound');
  const flat=new Float64Array(points.length*2);
  for(let i=0;i<points.length;i++){
    const p=points[i];if(!Array.isArray(p)||p.length!==2||!Number.isFinite(p[0])||!Number.isFinite(p[1])
      ||Math.abs(p[0])>180||Math.abs(p[1])>90)fail('Invalid exact chunk coordinate');
    flat[2*i]=p[0];flat[2*i+1]=p[1];
  }
  return flat;
}
function validFlat(points){
  if(!(points instanceof Float64Array)||!(points.buffer instanceof ArrayBuffer)||points.length<2
    ||points.length>MAX_CHUNK_POINTS*2||points.length%2||points.byteOffset!==0||points.buffer.byteLength!==points.byteLength)fail('Invalid private point buffer');
  for(let i=0;i<points.length;i+=2)if(!Number.isFinite(points[i])||!Number.isFinite(points[i+1])
    ||Math.abs(points[i])>180||Math.abs(points[i+1])>90)fail('Invalid point buffer coordinate');
}
export function validateChunkRequest(request){
  if(request?.schema!==CHUNK_CONTEXT_SCHEMA||!integer(request.requestId,1,Number.MAX_SAFE_INTEGER)
    ||!integer(request.generation,1,Number.MAX_SAFE_INTEGER)||!integer(request.serial,1,Number.MAX_SAFE_INTEGER)
    ||request.key!==chunkContextKey(request.projectionId,request.layoutId,request.cx,request.cz))fail('Invalid chunk request');
  validFlat(request.points);return request;
}
function normalizeContext(raw,identity){
  if(raw?.schema!=='world-drive-biome-context-v1'||raw.placementAuthority!==false||raw.elevationApplied!==false
    ||raw.transitionReady!==false||raw.regionalHint!==null||raw.resolutionDegrees!==null
    ||raw.source?.id!==identity.source.id||raw.source?.license!==identity.source.license
    ||raw.source?.sha256!==identity.source.sha256)fail('Invalid snapshot context authority/source');
  let record=null,biome=0;
  if(raw.status==='resolved'){
    const r=raw.ecoregion;
    if(!integer(r?.id,0,65534)||!(integer(r?.biome,1,14)||r?.biome===98)||!text(r?.name,256)||!r.name
      ||!text(r?.realm,128)||raw.reason!==null||raw.precision!=='source-polygons'
      ||raw.confidence!=='source-agreement'||raw.paletteEligible!==true)fail('Invalid resolved context');
    record=freeze({id:r.id,biome:r.biome,name:r.name,realm:r.realm});biome=biomeIdForRecord(record,identity.source.id);
  }else if(raw.status==='no-data'||raw.status==='unavailable'){
    if(raw.ecoregion!==null||raw.precision!==null||raw.confidence!=='unavailable'||raw.paletteEligible!==false
      ||!text(raw.reason,96)||!raw.reason||(raw.status==='no-data'&&raw.reason!=='source-no-data'))fail('Invalid unavailable context');
  }else fail('Invalid context status');
  const profile=BIOME_PROFILES[biome];
  if(raw.biome!==biome||raw.family!==profile.family||raw.palette!==profile.palette||raw.canopy!==profile.canopy
    ||typeof raw.boundaryDiagnostic!=='boolean')fail('Invalid snapshot profile');
  return freeze({schema:'world-drive-biome-context-v1',...profile,status:raw.status,reason:raw.reason,
    source:identity.source,ecoregion:record,precision:raw.precision,confidence:raw.confidence,
    paletteEligible:raw.paletteEligible,regionalHint:null,resolutionDegrees:null,
    transitionReady:false,boundaryDiagnostic:raw.boundaryDiagnostic,placementAuthority:false,elevationApplied:false});
}
export const MISSING_CHUNK_CONTEXT=freeze({schema:'world-drive-biome-context-v1',...BIOME_PROFILES[0],
  status:'unavailable',reason:'chunk-sample-not-prepared',source:null,ecoregion:null,precision:null,
  confidence:'unavailable',paletteEligible:false,regionalHint:null,resolutionDegrees:null,
  transitionReady:false,boundaryDiagnostic:false,placementAuthority:false,elevationApplied:false});
/** Called only by the preparation Worker (or deterministic test oracle). */
export function captureChunkContext(request,identity,session){
  validateChunkRequest(request);
  const fixed=snapshotIdentity(identity),state=session.diagnostics();
  if(!state.ready||state.generation!==request.generation||state.serial!==request.serial)fail('Stale or unready chunk window');
  const contexts=[],dictionary=new Map(),codes=new Uint16Array(request.points.length/2);
  for(let i=0;i<codes.length;i++){
    const c=normalizeContext(session.query(request.points[2*i+1],request.points[2*i]),fixed);
    const signature=JSON.stringify(c);let slot=dictionary.get(signature);
    if(slot===undefined){
      if(contexts.length>=MAX_CHUNK_CONTEXTS)fail('Chunk context diversity bound');
      slot=contexts.length;dictionary.set(signature,slot);contexts.push(c);
    }
    codes[i]=slot;
  }
  return {schema:CHUNK_CONTEXT_SCHEMA,identity:fixed,key:request.key,requestId:request.requestId,
    generation:request.generation,serial:request.serial,contexts,codes};
}
/** Bounded validation on receipt, not in a render lookup. No geometry is decoded. */
export function installChunkContext(packet,request,identity,{isCurrent=()=>true}={}){
  validateChunkRequest(request);const fixed=snapshotIdentity(identity);
  if(packet?.schema!==CHUNK_CONTEXT_SCHEMA||!sameSnapshotIdentity(packet.identity,fixed)||packet.key!==request.key
    ||packet.requestId!==request.requestId||packet.generation!==request.generation||packet.serial!==request.serial
    ||!Array.isArray(packet.contexts)||packet.contexts.length<1||packet.contexts.length>MAX_CHUNK_CONTEXTS
    ||!(packet.codes instanceof Uint16Array)||!(packet.codes.buffer instanceof ArrayBuffer)
    ||packet.codes.length!==request.points.length/2||packet.codes.byteOffset!==0||packet.codes.buffer.byteLength!==packet.codes.byteLength)fail('Invalid chunk reply identity/bounds');
  const contexts=freeze(packet.contexts.map(c=>normalizeContext(c,fixed)));
  const codes=new Uint16Array(packet.codes),points=new Float64Array(request.points);
  const counts={resolved:0,noData:0,unavailable:0};
  for(const slot of codes){
    if(slot>=contexts.length)fail('Invalid chunk context index');
    const status=contexts[slot].status;counts[status==='no-data'?'noData':status]++;
  }
  // Conservative retained coordinate/index/dictionary payload accounting. Object
  // headers, engine bookkeeping and caller-held old snapshots are additional.
  const payloadBytes=points.byteLength+codes.byteLength+contexts.length*MAX_CONTEXT_PAYLOAD;
  const matches=other=>other.length===points.length&&other.every((n,i)=>n===points[i]);
  const view=freeze({schema:CHUNK_CONTEXT_SCHEMA,key:request.key,cx:request.cx,cz:request.cz,
    projectionId:request.projectionId,layoutId:request.layoutId,identity:fixed,generation:request.generation,
    serial:request.serial,count:codes.length,counts:freeze(counts),payloadBytes,
    lookup(index,lon,lat){
      return isCurrent()&&integer(index,0,codes.length-1)&&lon===points[2*index]&&lat===points[2*index+1]
        ?contexts[codes[index]]:MISSING_CHUNK_CONTEXT;
    }});
  return {view,matches,payloadBytes};
}

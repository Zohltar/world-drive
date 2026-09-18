/** R12 pilot eligibility, not placement, current land cover, or a global palette.
 * A whole mesh may be substituted only after ALL 1,744 original R4 candidate
 * positions resolve to this same scoped source region. No centre-of-chunk guess.
 */
import {FOREST_POINT_COUNT,FOREST_LAYOUT_ID} from '../../src/scenery/biomes/forest-candidate-adapter.js';
import {createPaletteRegistry} from '../../src/scenery/biomes/palette-registry.js';
import {MAX_CHUNK_CONTEXTS} from '../../src/scenery/biomes/chunk-context-snapshot.js';
import {seasonalVegetationId} from './vegetation-winter-data.mjs';
export const R12_SOURCE=Object.freeze({id:'RESOLVE-ECOREGIONS-2017',license:'CC-BY-4.0',
  sha256:'be36d6209e443038d02e309f0447c6e7f2a62f5fe60c605ffe90d064952f2a60'});
export const R12_CATALOG_SHA='e35573844a53dbcf42b508e123649e62651f886d332bf1239ae97cf28d13e0e7';
export const R12_REGION=Object.freeze({id:686,biome:4,name:'Western European broadleaf forests',realm:'Palearctic'});
// Interned contexts make exact address checks cheap. Permit up to the known
// finite chunk size in one genuine idle slot; the controller STILL checks its
// unchanged 0.8 ms deadline before EACH read and never bypasses idle admission.
export const R12_LIMITS=Object.freeze({proofs:128,meshes:128,groups:2,checksPerSlice:FOREST_POINT_COUNT,
  proofSliceMs:.8,pollMs:120,chunksPerPoll:2,snapshotChunks:16});
export const R12_PROFILE='r12-nord-rendered';
export const R13_PROFILE='r13-manic-boreal';
export const R13_REGION=Object.freeze({id:373,biome:6,name:'Eastern Canadian forests',realm:'Nearctic'});
// Fixed reviewed profiles only: callers cannot inject arbitrary ecological rules,
// asset IDs, source regions or route callbacks through a launcher/configuration.
const profiles=Object.freeze({
  [R12_PROFILE]:Object.freeze({id:R12_PROFILE,region:R12_REGION,modelId:'preview-temperate',
    palette:'temperate-broadleaf-mixed',revision:'resolve2017-r12-nord-rendered',routeLabel:'Nordschleife',
    scope:'Only source-verified homogeneous Nordschleife forest chunks; existing R4 tree placements only'}),
  [R13_PROFILE]:Object.freeze({id:R13_PROFILE,region:R13_REGION,modelId:'preview-conifer',
    palette:'boreal-conifer',revision:'resolve2017-r13-manic-rendered',routeLabel:'Manic-2 → Manic-5',
    scope:'Only source-verified Eastern Canadian forest chunks along Manic-2 → Manic-5; existing R4 tree placements only'})
});
export function renderedProfile(id=R12_PROFILE){
  if(typeof id!=='string'||!Object.hasOwn(profiles,id))throw new TypeError('Unknown rendered biome profile');
  return profiles[id];
}
const registries=new Map(Object.values(profiles).map(p=>[p.id,createPaletteRegistry([
  {id:p.modelId,kind:'tree',reviewed:true,provenanceId:'original-R11-style-5732527872',weight:1,
    palettes:[p.palette],realms:[p.region.realm],ecoregionIds:[p.region.id]}
],{revision:p.id+'-homogeneous-model-v1'})]));
/** Route-envelope admission is NOT a source classification or exact road hash.
 * Real routers can resample a road; every candidate still needs exact source proof.
 * Manic is forward-only in this pilot. The bounds deliberately exclude other presets.
 */
export function renderedRouteMatches(id,plan,origin){
  const p=renderedProfile(id),c=plan?.coordinates;
  if(!Array.isArray(c)||c.length<2||c.length>20000)return false;
  if(p.id===R12_PROFILE)return c.length===1068&&c[0]?.[0]===6.951275&&c[0]?.[1]===50.337751;
  const near=(a,b)=>Array.isArray(a)&&a.length===2&&a.every(Number.isFinite)
    &&Math.abs(a[0]-b[0])<=.012&&Math.abs(a[1]-b[1])<=.008;
  if(!near(c[0],[-68.3467,49.3213])||!near(c.at(-1),[-68.7271214,50.6451065])
    ||!near([origin?.lon,origin?.lat],[-68.3467,49.3213])
    ||!Number.isFinite(plan.totalMeters)||plan.totalMeters<170000||plan.totalMeters>230000)return false;
  return c.every(a=>Array.isArray(a)&&a.length===2&&a.every(Number.isFinite)
    &&a[0]>=-68.90&&a[0]<=-68.20&&a[1]>=49.25&&a[1]<=50.72);
}
export function r12Season(value){
  if(value!=='summer'&&value!=='winter')throw new TypeError('Saison requise : summer ou winter');
  return value;
}
export function r12Model(season,profileId=R12_PROFILE){return seasonalVegetationId(renderedProfile(profileId).modelId,r12Season(season));}
export function r12ContextEligible(c,profileId=R12_PROFILE){
  const profile=renderedProfile(profileId),region=profile.region;
  if(c?.status!=='resolved'||c.confidence!=='source-agreement'||c.precision!=='source-polygons'
    ||c.paletteEligible!==true||c.placementAuthority!==false||c.elevationApplied!==false
    ||c.source?.id!==R12_SOURCE.id||c.source.license!==R12_SOURCE.license||c.source.sha256!==R12_SOURCE.sha256
    ||!Object.keys(region).every(k=>c.ecoregion?.[k]===region[k]))return false;
  // This is a hypothetical model eligibility query for an already existing R4
  // placement. This registry is private to the pilot and never spawns anything.
  return registries.get(profileId).select(c,{stableKey:profileId,placementAllowed:true}).assetId===profile.modelId;
}
export function createR12Proof(snapshot,adapter,cx,cz,profileId=R12_PROFILE){
  const profile=renderedProfile(profileId);
  if(snapshot?.layoutId!==FOREST_LAYOUT_ID||snapshot.count!==FOREST_POINT_COUNT
    ||snapshot.cx!==cx||snapshot.cz!==cz||snapshot.projectionId!==adapter?.projectionId
    ||snapshot.identity?.revision!==profile.revision
    ||snapshot.identity?.catalogSha256!==R12_CATALOG_SHA
    ||!Object.keys(R12_SOURCE).every(k=>snapshot.identity?.source?.[k]===R12_SOURCE[k])
    ||typeof snapshot.lookup!=='function')throw new TypeError('Invalid R12 exact-point snapshot');
  let next=0,failed=false,contextChecks=0;
  const point={},acceptedContexts=new Set();
  // R6 snapshots already intern, validate and deeply freeze their context
  // dictionary. Recheck every exact coordinate, but do not rerun the palette
  // registry/hash 1,744 times for the SAME immutable dictionary entry.
  // Mutable contexts or frozen objects with accessors are never memoized.
  const fixedData=value=>!!value&&typeof value==='object'
    &&Object.getPrototypeOf(value)===Object.prototype&&Object.isFrozen(value)
    &&Object.values(Object.getOwnPropertyDescriptors(value)).every(d=>'value' in d);
  function eligible(context){
    if(acceptedContexts.has(context))return true;
    contextChecks++;
    if(!r12ContextEligible(context,profileId))return false;
    if(acceptedContexts.size<MAX_CHUNK_CONTEXTS&&fixedData(context)
      &&fixedData(context.source)&&fixedData(context.ecoregion))acceptedContexts.add(context);
    return true;
  }
  return Object.freeze({
    step(max=R12_LIMITS.checksPerSlice){
      if(!Number.isInteger(max)||max<1||max>R12_LIMITS.checksPerSlice)throw new RangeError('Proof slice bound');
      let checked=0;
      while(!failed&&next<FOREST_POINT_COUNT&&checked<max){
        adapter.point(cx,cz,next,point);
        if(!eligible(snapshot.lookup(next,point.lon,point.lat)))failed=true;
        next++;checked++;
      }
      return {checked,done:failed||next===FOREST_POINT_COUNT,eligible:!failed&&next===FOREST_POINT_COUNT};
    },
    diagnostics(){return {contextChecks,cachedContexts:acceptedContexts.size,maxCachedContexts:MAX_CHUNK_CONTEXTS};},
    result(){return !failed&&next===FOREST_POINT_COUNT?Object.freeze({key:`${cx}:${cz}`,cx,cz,
      projectionId:adapter.projectionId,count:next,ecoregionId:profile.region.id,
      modelId:profile.modelId,profileId,sourceSha256:R12_SOURCE.sha256}):null;}
  });
}
export function r12ChunkKey(group){
  const m=/^forest-chunk-(-?\d+):(-?\d+)$/.exec(String(group?.name??''));
  if(!m)return null;
  const cx=Number(m[1]),cz=Number(m[2]);
  return Number.isSafeInteger(cx)&&Number.isSafeInteger(cz)&&Math.abs(cx)<536870912&&Math.abs(cz)<536870912
    ?{key:`${cx===0?0:cx}:${cz===0?0:cz}`,cx,cz}:null;
}
export function sameR12Geometry(a,b){
  if(!a||!b)return false;
  for(const name of ['position','normal','color']){
    const x=a.attributes?.[name]?.array,y=b.attributes?.[name]?.array;
    if(!x||!y||x.length!==y.length||!x.every((v,i)=>v===y[i]))return false;
  }
  const x=a.index?.array,y=b.index?.array;
  return !!x&&!!y&&x.length===y.length&&x.every((v,i)=>v===y[i]);
}

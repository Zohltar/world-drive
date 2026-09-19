/** R12 pilot eligibility, not placement, current land cover, or a global palette.
 * A whole mesh may be substituted only after ALL 1,744 original R4 candidate
 * positions resolve to this same scoped source region. No centre-of-chunk guess.
 */
import {FOREST_POINT_COUNT,FOREST_LAYOUT_ID} from '../../src/scenery/biomes/forest-candidate-adapter.js';
import {createPaletteRegistry} from '../../src/scenery/biomes/palette-registry.js';
import {MAX_CHUNK_CONTEXTS} from '../../src/scenery/biomes/chunk-context-snapshot.js';
import {seasonalVegetationId} from './vegetation-winter-data.mjs';
import LagunaCircuit from '../../src/routing/circuits/laguna-seca.json' with {type:'json'};
const lagunaCoordinates=Object.freeze(LagunaCircuit.coordinates.map(p=>Object.freeze([...p])));
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
export const R14_PROFILE='r14-laguna-woodland';
export const R15_PROFILE='r15-yungas-tropical';
export const R15_REGION=Object.freeze({id:444,biome:1,name:'Bolivian Yungas',realm:'Neotropic'});
export const R14_REGION=Object.freeze({id:423,biome:12,name:'California interior chaparral and woodlands',realm:'Nearctic'});
export const R13_REGION=Object.freeze({id:373,biome:6,name:'Eastern Canadian forests',realm:'Nearctic'});
// Fixed reviewed profiles only: callers cannot inject arbitrary ecological rules,
// asset IDs, source regions or route callbacks through a launcher/configuration.
const profiles=Object.freeze({
  [R12_PROFILE]:Object.freeze({id:R12_PROFILE,region:R12_REGION,modelId:'preview-temperate',
    palette:'temperate-broadleaf-mixed',revision:'resolve2017-r12-nord-rendered',routeLabel:'Nordschleife',
    scope:'Only source-verified homogeneous Nordschleife forest chunks; existing R4 tree placements only'}),
  [R13_PROFILE]:Object.freeze({id:R13_PROFILE,region:R13_REGION,modelId:'preview-conifer',
    palette:'boreal-conifer',revision:'resolve2017-r13-manic-rendered',routeLabel:'Manic-2 → Manic-5',
    scope:'Only source-verified Eastern Canadian forest chunks along Manic-2 → Manic-5; existing R4 tree placements only'}),
  [R15_PROFILE]:Object.freeze({id:R15_PROFILE,region:R15_REGION,modelId:'preview-tropical',
    palette:'tropical-moist-broadleaf',revision:'resolve2017-r15-yungas-rendered',routeLabel:'Chuspipata → Yolosa · Yungas',
    scope:'Only source-verified Bolivian Yungas forest chunks; existing R4 placements, not altitude or current land cover'}),
  [R14_PROFILE]:Object.freeze({id:R14_PROFILE,region:R14_REGION,modelId:'preview-woodland',
    palette:'mediterranean-woodland-scrub',revision:'resolve2017-r14-laguna-rendered',routeLabel:'Laguna Seca',
    scope:'Only source-verified homogeneous Laguna Seca woodland chunks; existing R4 placements and density, not current land cover'})
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
  if(p.id===R14_PROFILE)return origin?.lon===lagunaCoordinates[0][0]&&origin?.lat===lagunaCoordinates[0][1]
    &&c.length===lagunaCoordinates.length&&c.every((a,i)=>Array.isArray(a)&&a.length===2
      &&a[0]===lagunaCoordinates[i][0]&&a[1]===lagunaCoordinates[i][1]);
  const near=(a,b)=>Array.isArray(a)&&a.length===2&&a.every(Number.isFinite)
    &&Math.abs(a[0]-b[0])<=.012&&Math.abs(a[1]-b[1])<=.008;
  if(p.id===R15_PROFILE){
    // The normal live router can resample the old road. Admission binds the
    // preset endpoints, historic waypoint, finite envelope and length, NOT
    // an exact road hash; full source proof is still required for each tree chunk.
    const close=(a,b)=>Array.isArray(a)&&a.length===2&&a.every(Number.isFinite)
      &&Math.abs(a[0]-b[0])<=.0045&&Math.abs(a[1]-b[1])<=.0045;
    return close(c[0],[-67.81891,-16.29911])&&close(c.at(-1),[-67.73975,-16.23312])
      &&close([origin?.lon,origin?.lat],[-67.81891,-16.29911])
      &&Number.isFinite(plan.totalMeters)&&plan.totalMeters>=10000&&plan.totalMeters<=45000
      &&c.every(a=>Array.isArray(a)&&a.length===2&&a.every(Number.isFinite)
        &&a[0]>=-67.95&&a[0]<=-67.60&&a[1]>=-16.40&&a[1]<=-16.10)
      &&c.some(a=>close(a,[-67.7861,-16.2577]));
  }
  if(!near(c[0],[-68.3467,49.3213])||!near(c.at(-1),[-68.7271214,50.6451065])
    ||!near([origin?.lon,origin?.lat],[-68.3467,49.3213])
    ||!Number.isFinite(plan.totalMeters)||plan.totalMeters<170000||plan.totalMeters>230000)return false;
  return c.every(a=>Array.isArray(a)&&a.length===2&&a.every(Number.isFinite)
    &&a[0]>=-68.90&&a[0]<=-68.20&&a[1]>=49.25&&a[1]<=50.72);
}
// Windows are tied to the finite source package, not the forest draw radius.
// R13 reuses R10's continuously provisioned 900 m corridor. The larger R12
// circuit window asks for undeclared southern tiles at Manic startup.
const nordWindow=Object.freeze({aheadMeters:3600,behindMeters:2600,corridorMeters:2800,maxTiles:8});
const manicForward=Object.freeze({aheadMeters:2400,behindMeters:700,corridorMeters:900,maxTiles:8});
const manicReverse=Object.freeze({aheadMeters:700,behindMeters:2400,corridorMeters:900,maxTiles:8});
export function renderedWindowOptions(profileId=R12_PROFILE,direction=1){
  const p=renderedProfile(profileId);
  if(direction!==1&&direction!==-1)throw new TypeError('Rendered window direction');
  return p.id===R13_PROFILE?(direction===1?manicForward:manicReverse):nordWindow;
}
export function r12Season(value){
  if(value!=='summer'&&value!=='winter')throw new TypeError('Saison requise : summer ou winter');
  return value;
}
export function r12Model(season,profileId=R12_PROFILE){
  const profile=renderedProfile(profileId),model=seasonalVegetationId(profile.modelId,r12Season(season));
  if(!model)throw new TypeError('Variante '+season+' non disponible pour '+profile.routeLabel+'; utiliser summer.');
  return model;
}
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

/** R12 pilot eligibility, not placement, current land cover, or a global palette.
 * A whole mesh may be substituted only after ALL 1,744 original R4 candidate
 * positions resolve to this same scoped source region. No centre-of-chunk guess.
 */
import {FOREST_POINT_COUNT,FOREST_LAYOUT_ID} from '../../src/scenery/biomes/forest-candidate-adapter.js';
import {createPaletteRegistry} from '../../src/scenery/biomes/palette-registry.js';
import {seasonalVegetationId} from './vegetation-winter-data.mjs';
export const R12_SOURCE=Object.freeze({id:'RESOLVE-ECOREGIONS-2017',license:'CC-BY-4.0',
  sha256:'be36d6209e443038d02e309f0447c6e7f2a62f5fe60c605ffe90d064952f2a60'});
export const R12_CATALOG_SHA='e35573844a53dbcf42b508e123649e62651f886d332bf1239ae97cf28d13e0e7';
export const R12_REGION=Object.freeze({id:686,biome:4,name:'Western European broadleaf forests',realm:'Palearctic'});
// Use the existing 0.8 ms cooperative CPU budget rather than abandoning a
// genuine idle slot after only 64 cheap reads. Sparse native idle callbacks in
// software rendering exposed that throughput ceiling. The hard count is still
// finite, and the controller checks its unchanged time deadline before EACH read.
export const R12_LIMITS=Object.freeze({proofs:128,meshes:128,groups:2,checksPerSlice:256,
  proofSliceMs:.8,pollMs:120,chunksPerPoll:2,snapshotChunks:16});
const registry=createPaletteRegistry([{id:'preview-temperate',kind:'tree',reviewed:true,
  provenanceId:'original-R11-style-5732527872',weight:1,palettes:['temperate-broadleaf-mixed'],
  realms:[R12_REGION.realm],ecoregionIds:[R12_REGION.id]}],{revision:'r12-nord-homogeneous-model-v1'});
export function r12Season(value){
  if(value!=='summer'&&value!=='winter')throw new TypeError('Saison requise : summer ou winter');
  return value;
}
export function r12Model(season){return seasonalVegetationId('preview-temperate',r12Season(season));}
export function r12ContextEligible(c){
  if(c?.status!=='resolved'||c.confidence!=='source-agreement'||c.precision!=='source-polygons'
    ||c.paletteEligible!==true||c.placementAuthority!==false||c.elevationApplied!==false
    ||c.source?.id!==R12_SOURCE.id||c.source.license!==R12_SOURCE.license||c.source.sha256!==R12_SOURCE.sha256
    ||!Object.keys(R12_REGION).every(k=>c.ecoregion?.[k]===R12_REGION[k]))return false;
  // This is a hypothetical model eligibility query for an already existing R4
  // placement. This registry is private to the pilot and never spawns anything.
  return registry.select(c,{stableKey:'r12-homogeneous-region',placementAllowed:true}).assetId==='preview-temperate';
}
export function createR12Proof(snapshot,adapter,cx,cz){
  if(snapshot?.layoutId!==FOREST_LAYOUT_ID||snapshot.count!==FOREST_POINT_COUNT
    ||snapshot.cx!==cx||snapshot.cz!==cz||snapshot.projectionId!==adapter?.projectionId
    ||snapshot.identity?.catalogSha256!==R12_CATALOG_SHA
    ||!Object.keys(R12_SOURCE).every(k=>snapshot.identity?.source?.[k]===R12_SOURCE[k])
    ||typeof snapshot.lookup!=='function')throw new TypeError('Invalid R12 exact-point snapshot');
  let next=0,failed=false;
  const point={};
  return Object.freeze({
    step(max=R12_LIMITS.checksPerSlice){
      if(!Number.isInteger(max)||max<1||max>R12_LIMITS.checksPerSlice)throw new RangeError('Proof slice bound');
      let checked=0;
      while(!failed&&next<FOREST_POINT_COUNT&&checked<max){
        adapter.point(cx,cz,next,point);
        if(!r12ContextEligible(snapshot.lookup(next,point.lon,point.lat)))failed=true;
        next++;checked++;
      }
      return {checked,done:failed||next===FOREST_POINT_COUNT,eligible:!failed&&next===FOREST_POINT_COUNT};
    },
    result(){return !failed&&next===FOREST_POINT_COUNT?Object.freeze({key:`${cx}:${cz}`,cx,cz,
      projectionId:adapter.projectionId,count:next,ecoregionId:R12_REGION.id,
      modelId:'preview-temperate',sourceSha256:R12_SOURCE.sha256}):null;}
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

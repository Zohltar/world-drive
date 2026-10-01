import {
  MANIC2,MANIC5,YUNGAS_START,YUNGAS_END,YUNGAS_WAYPOINTS,
  LAGUNA_SECA_START,NORDSCHLEIFE_START
} from '../../src/routing/route-presets.js';

export const R24_DEFAULT_BIOMES=Object.freeze({
  nord:Object.freeze({id:'nord',profile:'r12-nord-rendered',pilot:'r22-nord-eifel',launcher:'eifel-r22'}),
  manic:Object.freeze({id:'manic',profile:'r13-manic-boreal',pilot:'r21-manic-boreal-diversity',launcher:'boreal-r21'}),
  laguna:Object.freeze({id:'laguna',profile:'r14-laguna-woodland',pilot:'r19-laguna-dry',launcher:'dry-r19'}),
  yungas:Object.freeze({id:'yungas',profile:'r15-yungas-tropical',pilot:'r20-yungas-humid-montane',launcher:'humid-r20'})
});
const finitePoint=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon);
const same=(a,b,tol=1e-5)=>finitePoint(a)&&finitePoint(b)&&Math.abs(a.lat-b.lat)<=tol&&Math.abs(a.lon-b.lon)<=tol;
const hasWaypoint=(list,want)=>Array.isArray(list)&&list.some(p=>same(p,want,1e-4));

/** R24 activation gate for already reviewed presets only.
 * This is intentionally NOT a world-wide land-cover guess. Unknown/custom routes
 * retain the original generic R4 presentation until their biome art is reviewed.
 */
export function selectDefaultBiomeR24(state={}){
  const start=state.routeStart,end=state.routeEnd,kind=state.routeKind??'road';
  if(kind==='circuit'&&same(start,NORDSCHLEIFE_START)&&same(end,NORDSCHLEIFE_START))return R24_DEFAULT_BIOMES.nord;
  if(kind==='circuit'&&same(start,LAGUNA_SECA_START)&&same(end,LAGUNA_SECA_START))return R24_DEFAULT_BIOMES.laguna;
  if(kind==='road'&&same(start,YUNGAS_START)&&same(end,YUNGAS_END)&&hasWaypoint(state.routeWaypoints,YUNGAS_WAYPOINTS[0]))
    return R24_DEFAULT_BIOMES.yungas;
  if(kind==='road'&&same(start,MANIC2)&&same(end,MANIC5))return R24_DEFAULT_BIOMES.manic;
  return null;
}

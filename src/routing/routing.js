import {createBoundsSpatialIndex,pointSegmentDistanceSquared} from '../geography/spatial-proximity-index.js';

// World Drive - routing geometry subsystem
// Pure route geometry helpers. Network fetching (OSRM/Nominatim) remains in main.js
// for this first routing refactor.

export function createRoutingGeometry({
  getSegments,
  getRouteLength
}) {
  function segments(){
    return getSegments?.()||[];
  }

  function routeLength(){
    return Number(getRouteLength?.())||0;
  }

  const ROUTE_PROXIMITY_CELL_M=240;
  const ROUTE_PROXIMITY_MAX_M=160;
  const routeProximityIndex=createBoundsSpatialIndex({
    cellSize:ROUTE_PROXIMITY_CELL_M,
    maxIndexedCells:1200
  });
  let routeIndexSignature={list:null,length:-1,first:null,middle:null,last:null};
  const routeProximityPerf={queries:0,fallbackQueries:0,rebuilds:0};

  function routeSignature(segs){
    const length=segs.length;
    return {
      list:segs,length,
      first:segs[0]||null,
      middle:segs[Math.floor(length/2)]||null,
      last:segs[length-1]||null
    };
  }

  function routeSignatureMatches(next){
    return routeIndexSignature.list===next.list&&routeIndexSignature.length===next.length&&
      routeIndexSignature.first===next.first&&routeIndexSignature.middle===next.middle&&
      routeIndexSignature.last===next.last;
  }

  function rebuildProximityIndex(){
    const segs=segments();
    routeProximityIndex.rebuild(segs,segment=>({
      minx:Math.min(segment.ax,segment.bx)-ROUTE_PROXIMITY_MAX_M,
      maxx:Math.max(segment.ax,segment.bx)+ROUTE_PROXIMITY_MAX_M,
      minz:Math.min(segment.az,segment.bz)-ROUTE_PROXIMITY_MAX_M,
      maxz:Math.max(segment.az,segment.bz)+ROUTE_PROXIMITY_MAX_M
    }));
    routeIndexSignature=routeSignature(segs);
    routeProximityPerf.rebuilds++;
    return proximityStats();
  }

  function ensureProximityIndex(){
    const segs=segments();
    if(!routeSignatureMatches(routeSignature(segs)))rebuildProximityIndex();
    return segs;
  }

  function isNearRoute(x,z,maxDistance,inclusive=false){
    const segs=ensureProximityIndex();
    if(!segs.length)return false;
    const limit=Math.max(0,Number(maxDistance)||0);
    routeProximityPerf.queries++;
    if(limit>ROUTE_PROXIMITY_MAX_M){
      routeProximityPerf.fallbackQueries++;
      const nearest=nearestRoute(x,z);
      return !!nearest&&Number.isFinite(nearest.d)&&(inclusive?nearest.d<=limit:nearest.d<limit);
    }
    const limit2=limit*limit;
    return routeProximityIndex.someAt(x,z,segment=>{
      const distance2=pointSegmentDistanceSquared(x,z,segment);
      return inclusive?distance2<=limit2:distance2<limit2;
    });
  }

  function proximityStats(){
    return {...routeProximityPerf,maxDistance:ROUTE_PROXIMITY_MAX_M,index:routeProximityIndex.stats()};
  }

  function nearestRoute(x,z){
    const segs=segments();
    let best=null;
    let bestD2=Infinity;

    for(let i=0;i<segs.length;i++){
      const s=segs[i];
      const vx=s.bx-s.ax;
      const vz=s.bz-s.az;
      const wx=x-s.ax;
      const wz=z-s.az;
      const vv=vx*vx+vz*vz||1;
      const t=Math.max(0,Math.min(1,(wx*vx+wz*vz)/vv));
      const px=s.ax+t*vx;
      const pz=s.az+t*vz;
      const dx=x-px;
      const dz=z-pz;
      const d2=dx*dx+dz*dz;

      if(d2<bestD2){
        bestD2=d2;
        best={
          ...s,
          i,
          t,
          px,
          pz,
          d:Math.sqrt(d2),
          angle:Math.atan2(vx,vz),
          cum:s.cum+t*s.len
        };
      }
    }

    return best;
  }

  function findSegmentAtCum(target){
    const segs=segments();
    if(!segs.length)return null;

    let lo=0;
    let hi=segs.length-1;

    while(lo<hi){
      const mid=(lo+hi)>>1;
      if(segs[mid].cum+segs[mid].len<target)lo=mid+1;
      else hi=mid;
    }

    return segs[lo]||null;
  }

  function pointOnSegmentAtCum(seg,target){
    if(!seg)return null;

    const t=Math.max(
      0,
      Math.min(1,(target-seg.cum)/(seg.len||1))
    );

    return {
      x:seg.ax+(seg.bx-seg.ax)*t,
      z:seg.az+(seg.bz-seg.az)*t,
      angle:Math.atan2(seg.bx-seg.ax,seg.bz-seg.az),
      cum:target
    };
  }

  function routePointAt(frac){
    const length=routeLength();
    const target=Math.max(0,Math.min(1,Number(frac)||0))*length;
    return pointOnSegmentAtCum(findSegmentAtCum(target),target);
  }

  function routePointAtCum(cum){
    const length=routeLength();
    const target=Math.max(0,Math.min(length,Number(cum)||0));
    return pointOnSegmentAtCum(findSegmentAtCum(target),target);
  }

  return {
    nearestRoute,
    isNearRoute,
    rebuildProximityIndex,
    proximityStats,
    routePointAt,
    routePointAtCum
  };
}

export function angleDelta(target,current){
  return Math.atan2(
    Math.sin(target-current),
    Math.cos(target-current)
  );
}

export function nearestPointOnPolyline(x,z,points){
  let best={d:Infinity,angle:0};

  for(let i=0;i<points.length-1;i++){
    const a=points[i];
    const b=points[i+1];
    const vx=b.x-a.x;
    const vz=b.z-a.z;
    const wx=x-a.x;
    const wz=z-a.z;
    const vv=vx*vx+vz*vz||1;
    const t=Math.max(0,Math.min(1,(wx*vx+wz*vz)/vv));
    const px=a.x+vx*t;
    const pz=a.z+vz*t;
    const d=Math.hypot(x-px,z-pz);

    if(d<best.d){
      best={
        d,
        angle:Math.atan2(vx,vz)
      };
    }
  }

  return best;
}

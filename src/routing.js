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

/** Diagnostic-only progress mapping. Construct once in an idle task, never a frame.
 * Worker windows use spherical metres; game positions use the route-origin plane.
 * The canonical route plan owns the cumulative distances in both consumers.
 */
import {createBiomeRoutePlan} from './route-tile-plan.js';
import {createForestCandidateAdapter,forestChunkAtAbsolute} from './forest-candidate-adapter.js';
export function createBiomeObserverPlan(route,{origin,routeId}={}){
  const adapter=createForestCandidateAdapter({origin,routeId});
  if(!Array.isArray(route)||route.length<2||route.length>20000)throw new RangeError('Diagnostic route size');
  const coordinates=route.map(p=>[p.lon,p.lat]);
  for(let i=1;i<coordinates.length;i++)if(Math.abs(coordinates[i][0]-coordinates[i-1][0])>=180)
    throw new RangeError('Diagnostic route crosses unsupported projection seam');
  const plan=createBiomeRoutePlan(coordinates),xy=new Float64Array(coordinates.length*2);
  const scale=Math.PI/180*6378137,cos=Math.cos(adapter.origin.lat*Math.PI/180);
  for(let i=0;i<coordinates.length;i++){
    const [lon,lat]=coordinates[i];xy[i*2]=(lon-adapter.origin.lon)*scale*cos;xy[i*2+1]=-(lat-adapter.origin.lat)*scale;
  }
  let hint=-1,lastX=Infinity,lastZ=Infinity,lastProgress=null,direction=1;
  function pointAt(distance){
    const p=Math.max(0,Math.min(plan.totalMeters,distance));let lo=0,hi=coordinates.length-2;
    while(lo<hi){const mid=Math.floor((lo+hi+1)/2);if(plan.distanceAtVertex(mid)<=p)lo=mid;else hi=mid-1;}
    const length=plan.distanceAtVertex(lo+1)-plan.distanceAtVertex(lo),t=length?(p-plan.distanceAtVertex(lo))/length:0;
    return {x:xy[lo*2]+(xy[lo*2+2]-xy[lo*2])*t,z:xy[lo*2+1]+(xy[lo*2+3]-xy[lo*2+1])*t};
  }
  function locate(x,z){
    forestChunkAtAbsolute(x,z);let best=Infinity,index=-1,fraction=0,tests=0;
    const moved=Math.hypot(x-lastX,z-lastZ),teleport=moved>960;
    // R9: a UI jump can skip many segments without reaching the independent
    // 960 m Worker-reset threshold. Trust the hint only for genuinely local
    // movement and re-anchor if its nearest segment is outside road proximity.
    const localHint=hint>=0&&moved<120;
    function scan(first,last){for(let i=first;i<=last;i++){
      const ax=xy[i*2],az=xy[i*2+1],dx=xy[i*2+2]-ax,dz=xy[i*2+3]-az,den=dx*dx+dz*dz;
      const t=den?Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/den)):0;
      const d=(x-ax-t*dx)**2+(z-az-t*dz)**2;tests++;
      if(d<best){best=d;index=i;fraction=t;}
    }}
    if(!localHint)scan(0,coordinates.length-2);
    else {scan(Math.max(0,hint-32),Math.min(coordinates.length-2,hint+32));if(best>20**2)scan(0,coordinates.length-2);}
    const progress=plan.distanceAtVertex(index)+(plan.distanceAtVertex(index+1)-plan.distanceAtVertex(index))*fraction;
    if(!teleport&&lastProgress!==null&&Math.abs(progress-lastProgress)>2)direction=progress>lastProgress?1:-1;
    if(teleport)direction=1;
    hint=index;lastX=x;lastZ=z;lastProgress=progress;
    const current=forestChunkAtAbsolute(x,z),chunks=[{...current,role:'current'}],keys=new Set([`${current.cx}:${current.cz}`]);
    for(const lead of [480,960,1440]){
      const p=pointAt(progress+direction*lead),c=forestChunkAtAbsolute(p.x,p.z),key=`${c.cx}:${c.cz}`;
      if(!keys.has(key)){keys.add(key);chunks.push({...c,role:'forward'});}
    }
    return {progress,direction,teleport,tests,distanceFromRoute:Math.sqrt(best),chunks,
      signature:`${current.cx}:${current.cz}:${direction}:${Math.floor(progress/120)}`};
  }
  return Object.freeze({adapter,coordinates,locate,totalMeters:plan.totalMeters,
    retainedNumericBytes:xy.byteLength+coordinates.length*8});
}

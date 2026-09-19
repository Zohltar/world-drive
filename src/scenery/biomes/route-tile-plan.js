/** Bounded continuous GeoJSON [longitude,latitude] polyline coverage.
 * Build once outside frame work. Windows include whole segments, not endpoints.
 * Distances use a spherical model; tile corridor is a conservative angular box.
 * No source lookup, I/O or forest scheduler dependency. Not game-activated.
 */
import {refinementAddress} from './local-refinement.js';
const RAD = Math.PI / 180, EARTH = 6371008.8;
const valid = p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0])
  && Math.abs(p[0]) <= 180 && Number.isFinite(p[1]) && Math.abs(p[1]) <= 90;
const wrap = x => (x % 3600 + 3600) % 3600;
function delta(a, b) {let d=b-a; if(d>180)d-=360; if(d< -180)d+=360; return d;}
function length(a, b) {
  const dy=(b[1]-a[1])*RAD, dx=delta(a[0],b[0])*RAD;
  const h=Math.sin(dy/2)**2 + Math.cos(a[1]*RAD)*Math.cos(b[1]*RAD)*Math.sin(dx/2)**2;
  return 2*EARTH*Math.asin(Math.sqrt(Math.max(0,Math.min(1,h))));
}
// Liang-Barsky closed rectangle test. Closed boundaries conservatively include
// either adjacent tile, including collinear seams and corner crossings.
function intersects(x0,y0,x1,y1,west,south,east,north) {
  let lo=0,hi=1;
  for(const [a,b,min,max] of [[x0,x1,west,east],[y0,y1,south,north]]) {
    const d=b-a;
    if(d===0) {if(a<min||a>max)return false;continue;}
    let l=(min-a)/d,h=(max-a)/d;if(l>h)[l,h]=[h,l];lo=Math.max(lo,l);hi=Math.min(hi,h);
    if(lo>hi+1e-12)return false;
  }
  return true;
}
export function createBiomeRoutePlan(coordinates) {
  if(!Array.isArray(coordinates)||coordinates.length<2||coordinates.length>20000||!coordinates.every(valid)) {
    throw new TypeError('Expected 2..20000 finite GeoJSON [longitude,latitude] positions');
  }
  const points=coordinates.map(p=>[p[0]===180?-180:p[0],p[1]]), cumulative=new Float64Array(points.length);
  for(let i=1;i<points.length;i++) {
    if(Math.abs(delta(points[i-1][0],points[i][0]))===180) throw new RangeError('Ambiguous half-world segment');
    cumulative[i]=cumulative[i-1]+length(points[i-1],points[i]);
  }
  const totalMeters=cumulative.at(-1);
  function window(positionMeters,{aheadMeters=3000,behindMeters=300,corridorMeters=1200,maxTiles=8,maxTests=4096}={}) {
    if(!Number.isFinite(positionMeters)||positionMeters<0||positionMeters>totalMeters
        || !Number.isFinite(aheadMeters)||aheadMeters<0||aheadMeters>50000
        || !Number.isFinite(behindMeters)||behindMeters<0||behindMeters>50000
        || !Number.isFinite(corridorMeters)||corridorMeters<0||corridorMeters>5000
        || !Number.isInteger(maxTiles)||maxTiles<1||maxTiles>32
        || !Number.isInteger(maxTests)||maxTests<1||maxTests>65536) throw new RangeError('Invalid route window/budget');
    const low=Math.max(0,positionMeters-behindMeters),high=Math.min(totalMeters,positionMeters+aheadMeters);
    let left=0,right=points.length-1;
    while(left<right) {const middle=Math.floor((left+right+1)/2);if(cumulative[middle]<=low)left=middle;else right=middle-1;}
    let anchorIndex=Math.min(left,points.length-2);
    while(anchorIndex<points.length-2&&cumulative[anchorIndex+1]<positionMeters)anchorIndex++;
    const ap=points[anchorIndex],aq=points[anchorIndex+1],ad=cumulative[anchorIndex+1]-cumulative[anchorIndex];
    const t=ad?(positionMeters-cumulative[anchorIndex])/ad:0;
    let lon=ap[0]+delta(ap[0],aq[0])*t;if(lon>180)lon-=360;if(lon< -180)lon+=360;
    const anchor=refinementAddress(ap[1]+(aq[1]-ap[1])*t,lon).key;
    const wanted=new Map();let tests=0,segments=0,limited=false;
    outer: for(let i=Math.min(left,points.length-2);i<points.length-1&&cumulative[i]<=high;i++) {
      if(++segments>maxTests) {limited=true;break;}
      const distance=cumulative[i+1]-cumulative[i];
      const a=distance?Math.max(0,(low-cumulative[i])/distance):0;
      const b=distance?Math.min(1,(high-cumulative[i])/distance):1;
      if(a>b)continue;
      const p=points[i],q=points[i+1],dx=delta(p[0],q[0]),dy=q[1]-p[1];
      const x0=(p[0]+dx*a+180)*10,x1=(p[0]+dx*b+180)*10;
      const lat0=p[1]+dy*a,lat1=p[1]+dy*b,y0=(90-lat0)*10,y1=(90-lat1)*10;
      const padY=corridorMeters/111195*10;
      const latitude=Math.min(90,Math.max(Math.abs(lat0),Math.abs(lat1))+padY/10);
      const padX=Math.min(1800,padY/Math.max(1e-8,Math.cos(latitude*RAD)));
      const xmin=Math.floor(Math.min(x0,x1)-padX-1e-10),xmax=Math.floor(Math.max(x0,x1)+padX+1e-10);
      const ymin=Math.max(0,Math.floor(Math.min(y0,y1)-padY-1e-10));
      const ymax=Math.min(1799,Math.floor(Math.max(y0,y1)+padY+1e-10));
      const progress=cumulative[i]+distance*(a+b)/2;
      const score=Math.abs(progress-positionMeters)+(progress<positionMeters?aheadMeters:0);
      for(let y=ymin;y<=ymax;y++)for(let x=xmin;x<=xmax;x++) {
        if(++tests>maxTests) {limited=true;break outer;}
        if(!intersects(x0,y0,x1,y1,x-padX,y-padY,x+1+padX,y+1+padY))continue;
        const col=wrap(x),key=`${col}-${y}`;
        const priority=key===anchor?-1:score;
        const old=wanted.get(key);if(!old||priority<old.score)wanted.set(key,{key,x:col,y,score:priority});
      }
    }
    const ordered=[...wanted.values()].sort((a,b)=>a.score-b.score||a.y-b.y||a.x-b.x);
    return Object.freeze({tiles:Object.freeze(ordered.slice(0,maxTiles).map(Object.freeze)),
      capacityLimited:ordered.length>maxTiles,planningLimited:limited,
      requiredTiles:ordered.length,tests:Math.min(tests,maxTests),segments:Math.min(segments,maxTests),
      positionMeters,fromMeters:low,toMeters:high,totalMeters,corridorMeters});
  }
  return Object.freeze({window,totalMeters,pointCount:points.length,
    distanceAtVertex(index){
      if(!Number.isInteger(index)||index<0||index>=cumulative.length)throw new RangeError('Invalid route vertex');
      return cumulative[index];
    }});
}

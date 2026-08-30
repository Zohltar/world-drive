import assert from 'node:assert/strict';
import {createRoutingService} from '../src/routing-service.js';
import {createRoadGeometrySystem} from '../src/road-geometry.js';
import {MANIC2,MANIC5,R169_START,R169_END,R132_START,R132_END,YUNGAS_START,YUNGAS_END,YUNGAS_WAYPOINTS} from '../src/route-presets.js';

const EARTH=6378137;
function geoDist(a,b){
  const R=6371000,p1=a.lat*Math.PI/180,p2=b.lat*Math.PI/180;
  const dp=(b.lat-a.lat)*Math.PI/180,dl=(b.lon-a.lon)*Math.PI/180;
  const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
}
function toWorld(origin,lat,lon){
  return {x:(lon-origin.lon)*Math.PI/180*EARTH*Math.cos(origin.lat*Math.PI/180),z:-(lat-origin.lat)*Math.PI/180*EARTH};
}
function buildSegments(coordinates,origin){
  const segments=[];let routeLength=0,last=null;
  for(const [lon,lat] of coordinates){
    const p=toWorld(origin,lat,lon);
    if(last){
      const len=Math.hypot(p.x-last.x,p.z-last.z);
      if(len>.02){segments.push({ax:last.x,az:last.z,bx:p.x,bz:p.z,len,cum:routeLength});routeLength+=len;}
    }
    last=p;
  }
  return {segments,routeLength};
}
function nearestRoute(segments,x,z){
  let best=null,bd=Infinity,bestI=-1;
  for(let i=0;i<segments.length;i++){
    const s=segments[i];
    const vx=s.bx-s.ax,vz=s.bz-s.az,vv=vx*vx+vz*vz||1;
    const t=Math.max(0,Math.min(1,((x-s.ax)*vx+(z-s.az)*vz)/vv));
    const px=s.ax+vx*t,pz=s.az+vz*t,d2=(x-px)**2+(z-pz)**2;
    if(d2<bd){bd=d2;bestI=i;best={...s,i,t,px,pz,cum:s.cum+t*s.len};}
  }
  return bestI>=0?best:null;
}

const presets=[
  {id:'manic2-manic5',start:MANIC2,end:MANIC5,waypoints:[]},
  {id:'r169',start:R169_START,end:R169_END,waypoints:[]},
  {id:'r132',start:R132_START,end:R132_END,waypoints:[]},
  {id:'yungas',start:YUNGAS_START,end:YUNGAS_END,waypoints:YUNGAS_WAYPOINTS}
];
const routing=createRoutingService({distance:geoDist,onStatus:()=>{},onLoadingText:()=>{}});
const results=[];
for(const preset of presets){
  const points=[preset.start,...preset.waypoints,preset.end];
  const {coordinates,provider}=await routing.fetchRoute({points,start:preset.start});
  assert.ok(coordinates.length>20,`${preset.id}: route too sparse`);
  assert.ok(coordinates.every(([lon,lat])=>Number.isFinite(lon)&&Number.isFinite(lat)),`${preset.id}: non-finite routed coordinates`);
  const {segments,routeLength}=buildSegments(coordinates,preset.start);
  assert.ok(routeLength>1000&&segments.length>10,`${preset.id}: invalid segment chain`);
  const first=segments[0];
  const state={absX:first.ax,absZ:first.az,routeLength,segments,worldOffset:{x:0,z:0}};
  const nearest=(x,z)=>nearestRoute(segments,x,z);

  const terrainAbs=(x,z)=>.045*z+15*Math.sin(x/180)+8*Math.sin(z/260)+3*Math.sin((x+z)/55);
  const road=createRoadGeometrySystem({
    THREE:{},roadEdgeMat:null,roadUnderMat:null,ROAD_SURFACE_OFFSET:0,
    terrainAbs,nearestRoute:nearest,bridgeHeightAtCum:()=>null,
    bridgeManager:{isNearApproach:()=>false},getState:()=>state
  });
  const engineered=road.buildProfile();
  assert.ok(engineered.length>50,`${preset.id}: active road builder returned too few points`);
  assert.ok(engineered.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)&&Number.isFinite(p.cum)&&Number.isFinite(p.y)&&Number.isFinite(p.roll)),`${preset.id}: active engineered profile contains NaN`);
  const maxBank=Math.max(...engineered.map(p=>Math.abs(p.roll||0)))*180/Math.PI;
  assert.ok(maxBank<=6.0001,`${preset.id}: active bank exceeds 6 degree engineering cap`);
  results.push({preset:preset.id,provider,route_km:+(routeLength/1000).toFixed(1),router_points:coordinates.length,profile_points:engineered.length,max_bank_deg:+maxBank.toFixed(3)});
}
console.table(results);
console.log('V21.31 ACTIVE LIVE PRESET ROUTING STRESS: PASS');

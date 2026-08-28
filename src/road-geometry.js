// World Drive V21.31 — bounded curve/crest smoothing over the proven road geometry base.
// Keeps the V21.30 road generator intact, then rounds routing-polyline corners and
// vertical DEM crests without allowing the road centreline to drift far from source.

import { createRoadGeometrySystem as createBaseRoadGeometrySystem } from './road-geometry-base.js';

function clamp01(v){return Math.max(0,Math.min(1,Number(v)||0));}
function smoothstep01(v){const t=clamp01(v);return t*t*(3-2*t);}

const ROAD_BANK_MIN_RAD=-5*Math.PI/180;
const ROAD_BANK_MAX_RAD=15*Math.PI/180;

export function clampRoadBankV21_31(roll){
  const value=Number.isFinite(roll)?roll:0;
  return Math.max(ROAD_BANK_MIN_RAD,Math.min(ROAD_BANK_MAX_RAD,value));
}

export function smoothRoadProfileV21_31(profile,{terrainAbs,bridgeHeightAtCum,bridgeManager}={}){
  if(!Array.isArray(profile)||profile.length<5)return Array.isArray(profile)?profile.map(p=>({...p,roll:clampRoadBankV21_31(p?.roll)})):[];
  const source=profile.map(p=>({...p}));
  let xy=source.map(p=>({x:p.x,z:p.z}));

  // Two conservative five-tap passes round the routing polyline. Each sample is
  // clamped to a small corridor around the original centreline so switchbacks and
  // narrow mountain roads cannot be shortcut by metres.
  for(let pass=0;pass<2;pass++){
    const next=xy.map(p=>({...p}));
    for(let i=2;i<xy.length-2;i++){
      const nearBridge=typeof bridgeManager?.isNearApproach==='function'&&bridgeManager.isNearApproach(source[i].cum,24);
      const onBridge=typeof bridgeHeightAtCum==='function'&&bridgeHeightAtCum(source[i].cum)!==null;
      const bridgeScale=(nearBridge||onBridge)?.35:1;
      const tx=(xy[i-2].x+2*xy[i-1].x+4*xy[i].x+2*xy[i+1].x+xy[i+2].x)/10;
      const tz=(xy[i-2].z+2*xy[i-1].z+4*xy[i].z+2*xy[i+1].z+xy[i+2].z)/10;
      const ox=source[i].x,oz=source[i].z;
      let dx=(tx-ox)*bridgeScale,dz=(tz-oz)*bridgeScale;
      const d=Math.hypot(dx,dz);
      const maxDrift=1.35;
      if(d>maxDrift&&d>1e-6){const s=maxDrift/d;dx*=s;dz*=s;}
      next[i]={x:ox+dx,z:oz+dz};
    }
    xy=next;
  }

  // Vertical rounding uses a wider, distance-local window than the legacy two
  // short passes. This removes the faceted crest/valley shape while preserving
  // bridges and the already-protected flat departure platform.
  let heights=source.map(p=>p.y);
  for(let pass=0;pass<3;pass++){
    const next=heights.slice();
    for(let i=3;i<heights.length-3;i++){
      const cum=source[i].cum;
      const bridgeY=typeof bridgeHeightAtCum==='function'?bridgeHeightAtCum(cum):null;
      if(bridgeY!==null){next[i]=bridgeY;continue;}
      const nearBridge=typeof bridgeManager?.isNearApproach==='function'&&bridgeManager.isNearApproach(cum,28);
      const target=(
        heights[i-3]+2*heights[i-2]+3*heights[i-1]+4*heights[i]+3*heights[i+1]+2*heights[i+2]+heights[i+3]
      )/16;
      const blend=nearBridge?.22:.72;
      next[i]=heights[i]+(target-heights[i])*blend;
    }
    heights=next;
  }

  const routeStart=(source[0]?.cum||0)<=1;
  const startY=source[0]?.y||0;
  return source.map((p,i)=>{
    let y=heights[i];
    // Do not disturb the V21.18 flat departure pad.
    if(routeStart&&p.cum<=28)y=startY;
    // Keep a generous terrain-relative vertical corridor. This is only a safety
    // net for pathological DEM spikes; normal smoothing stays far inside it.
    if(typeof terrainAbs==='function'&&typeof bridgeHeightAtCum==='function'&&bridgeHeightAtCum(p.cum)===null&&!(routeStart&&p.cum<=28)){
      const ground=terrainAbs(xy[i].x,xy[i].z);
      if(Number.isFinite(ground))y=Math.max(ground-3.5,Math.min(ground+3.5,y));
    }
    return {...p,x:xy[i].x,z:xy[i].z,y,roll:clampRoadBankV21_31(p.roll)};
  });
}

export function createRoadGeometrySystem(args={}){
  const base=createBaseRoadGeometrySystem(args);
  return Object.freeze({
    ...base,
    buildProfile(){
      const profile=base.buildProfile();
      return smoothRoadProfileV21_31(profile,args);
    }
  });
}

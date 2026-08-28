// World Drive V21.31 — bounded curve/crest smoothing over the proven road geometry base.
// Keeps the V21.30 road generator intact, then rounds routing-polyline corners and
// vertical DEM crests without allowing the road centreline to drift far from source.

import { createRoadGeometrySystem as createBaseRoadGeometrySystem } from './road-geometry-base.js';

function clamp01(v){return Math.max(0,Math.min(1,Number(v)||0));}
function smoothstep01(v){const t=clamp01(v);return t*t*(3-2*t);}
function angleDelta(a,b){return Math.atan2(Math.sin(b-a),Math.cos(b-a));}

const ROAD_BANK_MAX_RAD=6*Math.PI/180;
const ROAD_STRAIGHT_CROSSFALL_MAX_RAD=1*Math.PI/180;
const ROAD_BANK_MIN_CURVE_RAD=.35*Math.PI/180;

export function clampRoadBankV21_31(roll){
  const value=Number.isFinite(roll)?roll:0;
  return Math.max(-ROAD_BANK_MAX_RAD,Math.min(ROAD_BANK_MAX_RAD,value));
}

function clampStraightCrossfall(roll){
  const value=Number.isFinite(roll)?roll:0;
  return Math.max(-ROAD_STRAIGHT_CROSSFALL_MAX_RAD,Math.min(ROAD_STRAIGHT_CROSSFALL_MAX_RAD,value));
}

// Road R2 — terrain may suggest a cross-slope, but it must not decide the bank
// of a persistent curve. Real roads are engineered so the outside edge is normally
// higher than the inside edge. Derive that direction from plan curvature, use the
// terrain-derived roll only as a tiny straight-road crossfall, then smooth the
// transition over distance. This prevents long adverse-camber mountain curves.
export function engineerRoadBankingV21_31(profile){
  if(!Array.isArray(profile)||!profile.length)return [];
  if(profile.length<9)return profile.map(p=>({...p,roll:clampStraightCrossfall(p?.roll)}));

  const out=profile.map(p=>({...p}));
  const n=out.length;
  const halfSpan=Math.min(8,Math.max(3,Math.floor((n-1)/4)));
  const turn=new Array(n).fill(0);
  const radius=new Array(n).fill(Infinity);

  for(let i=halfSpan;i<n-halfSpan;i++){
    const a=out[i-halfSpan],p=out[i],b=out[i+halfSpan];
    const h0=Math.atan2(p.x-a.x,p.z-a.z);
    const h1=Math.atan2(b.x-p.x,b.z-p.z);
    const d=angleDelta(h0,h1);
    const ds=.5*(Math.hypot(p.x-a.x,p.z-a.z)+Math.hypot(b.x-p.x,b.z-p.z));
    turn[i]=d;
    if(Math.abs(d)>.0002&&ds>.5)radius[i]=Math.max(25,ds/Math.abs(d));
  }

  const curveSign=new Array(n).fill(0);
  const curveTarget=new Array(n).fill(0);
  const curveStrength=new Array(n).fill(0);

  for(let i=halfSpan+4;i<n-halfSpan-4;i++){
    let signed=0,absSum=0,active=0,same=0;
    for(let k=-4;k<=4;k++){
      const d=turn[i+k];
      signed+=d;
      absSum+=Math.abs(d);
      if(Math.abs(d)>.0015)active++;
    }
    const sign=Math.sign(signed);
    if(!sign||active<5||absSum<.012)continue;
    for(let k=-4;k<=4;k++){
      const d=turn[i+k];
      if(Math.abs(d)<=.0015||Math.sign(d)===sign)same++;
    }
    const consistency=same/9;
    if(consistency<.78)continue;

    let rSum=0,rWeight=0;
    for(let k=-3;k<=3;k++){
      const r=radius[i+k];
      if(!Number.isFinite(r))continue;
      const w=4-Math.abs(k);
      rSum+=r*w;
      rWeight+=w;
    }
    if(!rWeight)continue;
    const r=Math.max(25,rSum/rWeight);

    // Roughly 0.7° at R=2000 m, 1.0° at R=1000 m, 1.65° at
    // R=500 m, 3° at R=250 m, and capped near 6° on tight mountain bends.
    const bankDeg=Math.max(.35,Math.min(6,.35+650/r));
    const persistence=smoothstep01((consistency-.76)/.20);
    const curvature=smoothstep01((absSum-.010)/.070);
    const strength=Math.max(.35,Math.min(1,persistence*Math.max(.45,curvature)));

    curveSign[i]=sign;
    curveStrength[i]=strength;
    curveTarget[i]=sign*(bankDeg*Math.PI/180)*strength;
  }

  let bank=out.map((p,i)=>curveSign[i]?curveTarget[i]:clampStraightCrossfall(p.roll));
  for(let pass=0;pass<6;pass++){
    const next=bank.slice();
    for(let i=2;i<n-2;i++){
      next[i]=(bank[i-2]+2*bank[i-1]+4*bank[i]+2*bank[i+1]+bank[i+2])/10;
    }
    bank=next;
  }

  const routeStart=(out[0]?.cum||0)<=1;
  for(let i=0;i<n;i++){
    const sign=curveSign[i];
    let roll=clampRoadBankV21_31(bank[i]);

    if(sign){
      // Never permit adverse camber in a persistent curve. During transitions it
      // is preferable to pass through flat than to lean toward the outside.
      if(roll*sign<0)roll=0;
      const minimumInward=ROAD_BANK_MIN_CURVE_RAD*Math.min(1,curveStrength[i]);
      if(Math.abs(roll)<minimumInward)roll=sign*minimumInward;
    }else{
      roll=clampStraightCrossfall(roll);
    }

    if(routeStart){
      const cum=Number(out[i].cum)||0;
      if(cum<=45)roll=0;
      else if(cum<110)roll*=smoothstep01((cum-45)/65);
    }
    out[i].roll=roll;
  }
  return out;
}

export function smoothRoadProfileV21_31(profile,{terrainAbs,bridgeHeightAtCum,bridgeManager}={}){
  if(!Array.isArray(profile)||profile.length<5)return Array.isArray(profile)?engineerRoadBankingV21_31(profile):[];
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
  const rounded=source.map((p,i)=>{
    let y=heights[i];
    // Do not disturb the V21.18 flat departure pad.
    if(routeStart&&p.cum<=28)y=startY;
    // Keep a generous terrain-relative vertical corridor. This is only a safety
    // net for pathological DEM spikes; normal smoothing stays far inside it.
    if(typeof terrainAbs==='function'&&typeof bridgeHeightAtCum==='function'&&bridgeHeightAtCum(p.cum)===null&&!(routeStart&&p.cum<=28)){
      const ground=terrainAbs(xy[i].x,xy[i].z);
      if(Number.isFinite(ground))y=Math.max(ground-3.5,Math.min(ground+3.5,y));
    }
    return {...p,x:xy[i].x,z:xy[i].z,y};
  });
  return engineerRoadBankingV21_31(rounded);
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

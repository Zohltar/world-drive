// World Drive V21.31 — bounded curve/crest smoothing over the proven road geometry base.
// Keeps the V21.30 road generator intact, then rounds routing-polyline corners and
// vertical DEM crests without allowing the road centreline to drift far from source.

import { createRoadGeometrySystem as createBaseRoadGeometrySystem } from './road-geometry-base.js';

function clamp01(v){return Math.max(0,Math.min(1,Number(v)||0));}
function smoothstep01(v){const t=clamp01(v);return t*t*(3-2*t);}
function angleDelta(a,b){return Math.atan2(Math.sin(b-a),Math.cos(b-a));}

export function applyRoadSuperelevationV21_31(profile){
  if(!Array.isArray(profile)||profile.length<9)return Array.isArray(profile)?profile.map(p=>({...p})):[];
  const out=profile.map(p=>({...p}));
  const n=out.length;
  const turn=new Array(n).fill(0);
  const radius=new Array(n).fill(Infinity);

  // Estimate signed curvature from the already-smoothed centreline. Positive/negative
  // sign follows heading change; roll uses the same sign because positive roll raises
  // the left edge and a right-hand curve needs the left (outer) edge raised.
  for(let i=1;i<n-1;i++){
    const a=out[i-1],p=out[i],b=out[i+1];
    const h0=Math.atan2(p.x-a.x,p.z-a.z);
    const h1=Math.atan2(b.x-p.x,b.z-p.z);
    const d=angleDelta(h0,h1);
    const ds=.5*(Math.hypot(p.x-a.x,p.z-a.z)+Math.hypot(b.x-p.x,b.z-p.z));
    turn[i]=d;
    radius[i]=Math.abs(d)>1e-5?Math.max(1,ds/Math.abs(d)):Infinity;
  }

  const target=new Array(n).fill(0);
  const maxBank=4*Math.PI/180;

  for(let i=4;i<n-4;i++){
    // Require one consistent bend over roughly 25 m around the sample. This rejects
    // isolated routing kinks and S-transition points.
    let signed=0,absSum=0,same=0,total=0;
    for(let k=-4;k<=4;k++){
      const d=turn[i+k];
      signed+=d;
      absSum+=Math.abs(d);
      if(Math.abs(d)>.0004)total++;
    }
    const sign=Math.sign(signed);
    if(!sign||absSum<.018)continue;
    for(let k=-4;k<=4;k++)if(Math.sign(turn[i+k])===sign||Math.abs(turn[i+k])<=.0004)same++;
    const consistency=same/9;
    if(consistency<.78)continue;

    // Use the local median-like mean radius. Very tight corners are low-speed and
    // intentionally receive almost no banking; long, flowing highway curves get it.
    let rSum=0,rCount=0;
    for(let k=-3;k<=3;k++){
      const r=radius[i+k];
      if(Number.isFinite(r)&&r<2000){rSum+=r;rCount++;}
    }
    if(!rCount)continue;
    const r=rSum/rCount;

    const tightGate=smoothstep01((r-38)/62);       // ~0 below 40 m, full by ~100 m
    const broadGate=1-smoothstep01((r-650)/550);  // fade on almost-straight kilometre arcs
    const persistence=smoothstep01((absSum-.018)/.055);
    const strength=tightGate*broadGate*(.35+.65*persistence)*smoothstep01((consistency-.72)/.22);
    if(strength<=0)continue;

    // Typical public-road superelevation: subtle, never race-track banking.
    const radiusBias=.45+.55*(1-smoothstep01((r-120)/420));
    target[i]=sign*maxBank*strength*radiusBias;
  }

  // Long transition spirals: several passes spread the bank into/out of the curve
  // rather than twisting the road abruptly at a single sample.
  let bank=target;
  for(let pass=0;pass<6;pass++){
    const next=bank.slice();
    for(let i=2;i<n-2;i++){
      next[i]=(bank[i-2]+2*bank[i-1]+4*bank[i]+2*bank[i+1]+bank[i+2])/10;
    }
    bank=next;
  }

  // Keep route departure pad level and kill tiny residual numerical bank in straights.
  const routeStart=(out[0]?.cum||0)<=1;
  for(let i=0;i<n;i++){
    let roll=Math.abs(bank[i])<.0008?0:Math.max(-maxBank,Math.min(maxBank,bank[i]));
    if(routeStart&&out[i].cum<=40)roll=0;
    out[i].roll=roll;
  }
  return out;
}

export function smoothRoadProfileV21_31(profile,{terrainAbs,bridgeHeightAtCum,bridgeManager}={}){
  if(!Array.isArray(profile)||profile.length<5)return Array.isArray(profile)?profile.map(p=>({...p})):[];
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
    return {...p,x:xy[i].x,z:xy[i].z,y,roll:0};
  });
  return applyRoadSuperelevationV21_31(rounded);
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

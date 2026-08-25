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
    let signed=0,absSum=0,same=0;
    for(let k=-4;k<=4;k++){
      const d=turn[i+k];
      signed+=d;
      absSum+=Math.abs(d);
    }
    const sign=Math.sign(signed);
    if(!sign||absSum<.018)continue;
    for(let k=-4;k<=4;k++)if(Math.sign(turn[i+k])===sign||Math.abs(turn[i+k])<=.0004)same++;
    const consistency=same/9;
    if(consistency<.78)continue;

    let rSum=0,rCount=0;
    for(let k=-3;k<=3;k++){
      const r=radius[i+k];
      if(Number.isFinite(r)&&r<2000){rSum+=r;rCount++;}
    }
    if(!rCount)continue;
    const r=rSum/rCount;

    const tightGate=smoothstep01((r-38)/62);
    const broadGate=1-smoothstep01((r-650)/550);
    const persistence=smoothstep01((absSum-.018)/.055);
    const strength=tightGate*broadGate*(.35+.65*persistence)*smoothstep01((consistency-.72)/.22);
    if(strength<=0)continue;

    const radiusBias=.45+.55*(1-smoothstep01((r-120)/420));
    target[i]=sign*maxBank*strength*radiusBias;
  }

  let bank=target;
  for(let pass=0;pass<6;pass++){
    const next=bank.slice();
    for(let i=2;i<n-2;i++){
      next[i]=(bank[i-2]+2*bank[i-1]+4*bank[i]+2*bank[i+1]+bank[i+2])/10;
    }
    bank=next;
  }

  const routeStart=(out[0]?.cum||0)<=1;
  for(let i=0;i<n;i++){
    let roll=Math.abs(bank[i])<.0008?0:Math.max(-maxBank,Math.min(maxBank,bank[i]));
    if(routeStart&&out[i].cum<=40)roll=0;
    out[i].roll=roll;
  }
  return out;
}

// V21.31 P3.1 — engineered longitudinal grade.
// The DEM is now only the large-scale reference. A ~360 m full triangular window
// rejects local hills/valleys and the repeated passes create long vertical curves.
// This is intentionally much broader than the old ~60 m filter: the road should
// follow the mountain, not every terrain ripple.
export function engineerVerticalProfileV21_31(source,{bridgeHeightAtCum,bridgeManager}={}){
  const n=source.length;
  if(n<9)return source.map(p=>p.y);
  let heights=source.map(p=>p.y);
  const halfWindow=30; // samples are normally <=3 m: roughly +/-90 m, ~180 m full span

  for(let pass=0;pass<4;pass++){
    const next=heights.slice();
    for(let i=1;i<n-1;i++){
      const cum=source[i].cum;
      const bridgeY=typeof bridgeHeightAtCum==='function'?bridgeHeightAtCum(cum):null;
      if(bridgeY!==null){next[i]=bridgeY;continue;}

      let sum=0,weightSum=0;
      for(let k=-halfWindow;k<=halfWindow;k++){
        const j=i+k;
        if(j<0||j>=n)continue;
        const w=halfWindow+1-Math.abs(k);
        sum+=heights[j]*w;
        weightSum+=w;
      }
      const trend=weightSum?sum/weightSum:heights[i];
      const nearBridge=typeof bridgeManager?.isNearApproach==='function'&&bridgeManager.isNearApproach(cum,45);
      const blend=nearBridge?.18:.94;
      next[i]=heights[i]+(trend-heights[i])*blend;
    }
    heights=next;
  }

  // Limit abrupt changes in grade while preserving the broad elevation trend.
  // This approximates a road vertical-curve design rather than another DEM blur.
  for(let pass=0;pass<3;pass++){
    const next=heights.slice();
    for(let i=2;i<n-2;i++){
      const bridgeY=typeof bridgeHeightAtCum==='function'?bridgeHeightAtCum(source[i].cum):null;
      if(bridgeY!==null){next[i]=bridgeY;continue;}
      next[i]=(heights[i-2]+2*heights[i-1]+6*heights[i]+2*heights[i+1]+heights[i+2])/12;
    }
    heights=next;
  }
  return heights;
}

export function smoothRoadProfileV21_31(profile,{terrainAbs,bridgeHeightAtCum,bridgeManager}={}){
  if(!Array.isArray(profile)||profile.length<5)return Array.isArray(profile)?profile.map(p=>({...p})):[];
  const source=profile.map(p=>({...p}));
  let xy=source.map(p=>({x:p.x,z:p.z}));

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

  const heights=engineerVerticalProfileV21_31(source,{bridgeHeightAtCum,bridgeManager});
  const routeStart=(source[0]?.cum||0)<=1;
  const startY=source[0]?.y||0;

  const rounded=source.map((p,i)=>{
    let y=heights[i];
    if(routeStart&&p.cum<=28)y=startY;

    const bridgeY=typeof bridgeHeightAtCum==='function'?bridgeHeightAtCum(p.cum):null;
    if(bridgeY!==null)y=bridgeY;

    // Terrain is only a last-resort sanity envelope now. The engineered road grade
    // remains authoritative through normal cuts/fills instead of being clamped back
    // onto each local DEM bump.
    if(typeof terrainAbs==='function'&&bridgeY===null&&!(routeStart&&p.cum<=28)){
      const ground=terrainAbs(xy[i].x,xy[i].z);
      if(Number.isFinite(ground))y=Math.max(ground-18,Math.min(ground+18,y));
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

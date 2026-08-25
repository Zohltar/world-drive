// World Drive V21.31 — bounded curve/crest smoothing over the proven road geometry base.
// Keeps the V21.30 road generator intact, then rounds routing-polyline corners and
// vertical DEM crests without allowing the road centreline to drift far from source.

import { createRoadGeometrySystem as createBaseRoadGeometrySystem } from './road-geometry-base.js';

function clamp01(v){return Math.max(0,Math.min(1,Number(v)||0));}
function smoothstep01(v){const t=clamp01(v);return t*t*(3-2*t);}
function angleDelta(a,b){return Math.atan2(Math.sin(b-a),Math.cos(b-a));}

export function applyRoadSuperelevationV21_31(profile){
  if(!Array.isArray(profile)||profile.length<21)return Array.isArray(profile)?profile.map(p=>({...p,roll:0})):[];
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
  const maxBank=1.75*Math.PI/180;

  // V21.31 P2.1 — public-road banking, not racetrack banking.
  // Samples are usually <=3 m apart. A +/-10 sample window therefore verifies
  // that the turn persists for roughly 50-60 m before any meaningful bank is added.
  for(let i=10;i<n-10;i++){
    let signed=0,absSum=0,same=0;
    for(let k=-10;k<=10;k++){
      const d=turn[i+k];
      signed+=d;
      absSum+=Math.abs(d);
    }

    const sign=Math.sign(signed);
    if(!sign||absSum<.035)continue;

    for(let k=-10;k<=10;k++){
      const d=turn[i+k];
      if(Math.sign(d)===sign||Math.abs(d)<=.00035)same++;
    }
    const consistency=same/21;
    if(consistency<.84)continue;

    let rSum=0,rWeight=0;
    for(let k=-6;k<=6;k++){
      const r=radius[i+k];
      if(Number.isFinite(r)&&r<3000){
        const w=7-Math.abs(k);
        rSum+=r*w;
        rWeight+=w;
      }
    }
    if(!rWeight)continue;
    const r=rSum/rWeight;

    // Tight bends are assumed low-speed and remain essentially flat. Banking
    // appears only on broader, sustained curves and stays deliberately subtle.
    const tightGate=smoothstep01((r-120)/140);       // 0 <=120 m, full around 260 m
    const broadGate=1-smoothstep01((r-1000)/700);   // fade again on nearly-straight arcs
    const persistence=smoothstep01((absSum-.035)/.08);
    const consistencyGate=smoothstep01((consistency-.82)/.15);
    const radiusShape=.55+.45*smoothstep01((r-180)/350);
    const strength=tightGate*broadGate*persistence*consistencyGate*radiusShape;
    if(strength<=0)continue;

    target[i]=sign*maxBank*strength;
  }

  // Long transitions into/out of the small amount of bank that remains.
  let bank=target;
  for(let pass=0;pass<8;pass++){
    const next=bank.slice();
    for(let i=2;i<n-2;i++){
      next[i]=(bank[i-2]+2*bank[i-1]+4*bank[i]+2*bank[i+1]+bank[i+2])/10;
    }
    bank=next;
  }

  const routeStart=(out[0]?.cum||0)<=1;
  for(let i=0;i<n;i++){
    // Less than ~0.08 degree is visually/physically irrelevant: snap it flat.
    let roll=Math.abs(bank[i])<.0014?0:Math.max(-maxBank,Math.min(maxBank,bank[i]));
    if(routeStart&&out[i].cum<=50)roll=0;
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

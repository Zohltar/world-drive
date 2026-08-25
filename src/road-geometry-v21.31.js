// World Drive V21.31 — engineered road geometry over the proven mesh/query base.
// V21.31 owns route sampling, final centreline height and cross-slope. The base
// module remains responsible only for mesh builders, active-profile indexing and
// surface queries.

import { createRoadGeometrySystem as createBaseRoadGeometrySystem } from './road-geometry-base.js';

function clamp01(v){return Math.max(0,Math.min(1,Number(v)||0));}
function smoothstep01(v){const t=clamp01(v);return t*t*(3-2*t);}
function angleDelta(a,b){return Math.atan2(Math.sin(b-a),Math.cos(b-a));}

export function sampleRoutePlanarV21_31({getState,nearestRoute}={}){
  const state=typeof getState==='function'?(getState()||{}):{};
  const absX=Number(state.absX)||0,absZ=Number(state.absZ)||0;
  const routeLength=Math.max(0,Number(state.routeLength)||0);
  const segments=Array.isArray(state.segments)?state.segments:[];
  if(!segments.length||routeLength<=0)return [];

  const nr=typeof nearestRoute==='function'?nearestRoute(absX,absZ):null;
  const centerCum=Number(nr?.cum)||0;
  const minCum=Math.max(0,centerCum-1800);
  const maxCum=Math.min(routeLength,centerCum+3600);
  const raw=[];
  let lastIncluded=null;

  for(const seg of segments){
    const segStart=Number(seg.cum)||0;
    const segLen=Math.max(0,Number(seg.len)||0);
    const segEnd=segStart+segLen;
    if(segEnd<minCum||segStart>maxCum)continue;
    const t0=segLen>0?Math.max(0,(minCum-segStart)/segLen):0;
    const t1=segLen>0?Math.min(1,(maxCum-segStart)/segLen):1;
    if(t1<t0)continue;
    const sampledLen=Math.max(0,segLen*(t1-t0));
    const steps=Math.max(1,Math.ceil(sampledLen/3));
    for(let k=0;k<steps;k++){
      const u=k/steps,t=t0+(t1-t0)*u;
      const x=Number(seg.ax)+(Number(seg.bx)-Number(seg.ax))*t;
      const z=Number(seg.az)+(Number(seg.bz)-Number(seg.az))*t;
      const cum=segStart+segLen*t;
      if(!Number.isFinite(x)||!Number.isFinite(z))continue;
      if(!raw.length||Math.hypot(x-raw[raw.length-1].x,z-raw[raw.length-1].z)>.4)raw.push({x,z,cum,y:0,roll:0});
    }
    lastIncluded={seg,t:t1};
  }

  if(lastIncluded&&raw.length){
    const {seg,t}=lastIncluded;
    const x=Number(seg.ax)+(Number(seg.bx)-Number(seg.ax))*t;
    const z=Number(seg.az)+(Number(seg.bz)-Number(seg.az))*t;
    const cum=(Number(seg.cum)||0)+(Number(seg.len)||0)*t;
    if(Number.isFinite(x)&&Number.isFinite(z)&&Math.hypot(x-raw[raw.length-1].x,z-raw[raw.length-1].z)>.05)raw.push({x,z,cum,y:0,roll:0});
  }
  return raw;
}

export function stripLegacyTerrainAuthorityV21_31(profile){
  if(!Array.isArray(profile))return [];
  return profile.map(p=>({
    x:Number(p.x)||0,
    z:Number(p.z)||0,
    cum:Number(p.cum)||0,
    y:0,
    roll:0
  }));
}

export function applyRoadSuperelevationV21_31(profile){
  if(!Array.isArray(profile)||profile.length<25)return Array.isArray(profile)?profile.map(p=>({...p,roll:0})):[];
  const out=profile.map(p=>({...p}));
  const n=out.length;
  const coarseTurn=new Array(n).fill(0);
  const coarseRadius=new Array(n).fill(Infinity);
  const halfSpan=10;
  for(let i=halfSpan;i<n-halfSpan;i++){
    const a=out[i-halfSpan],p=out[i],b=out[i+halfSpan];
    const h0=Math.atan2(p.x-a.x,p.z-a.z);
    const h1=Math.atan2(b.x-p.x,b.z-p.z);
    const d=angleDelta(h0,h1);
    const ds=.5*(Math.hypot(p.x-a.x,p.z-a.z)+Math.hypot(b.x-p.x,b.z-p.z));
    coarseTurn[i]=d;
    coarseRadius[i]=Math.abs(d)>.002?Math.max(1,ds/Math.abs(d)):Infinity;
  }
  const target=new Array(n).fill(0);
  const maxBank=1.5*Math.PI/180;
  for(let i=12;i<n-12;i++){
    let signed=0,absSum=0,same=0,active=0;
    for(let k=-4;k<=4;k++){const d=coarseTurn[i+k];signed+=d;absSum+=Math.abs(d);if(Math.abs(d)>.004)active++;}
    const sign=Math.sign(signed);
    if(!sign||active<5||absSum<.055)continue;
    for(let k=-4;k<=4;k++){const d=coarseTurn[i+k];if(Math.abs(d)<=.004||Math.sign(d)===sign)same++;}
    const consistency=same/9;
    if(consistency<.89)continue;
    let rSum=0,rWeight=0;
    for(let k=-3;k<=3;k++){
      const r=coarseRadius[i+k];
      if(Number.isFinite(r)&&r<4000){const w=4-Math.abs(k);rSum+=r*w;rWeight+=w;}
    }
    if(!rWeight)continue;
    const r=rSum/rWeight;
    const tightGate=smoothstep01((r-150)/180);
    const broadGate=1-smoothstep01((r-1200)/900);
    const persistence=smoothstep01((absSum-.055)/.14);
    const strength=tightGate*broadGate*persistence*smoothstep01((consistency-.86)/.12);
    if(strength>0)target[i]=sign*maxBank*strength;
  }
  let bank=target;
  for(let pass=0;pass<6;pass++){
    const next=bank.slice();
    for(let i=2;i<n-2;i++)next[i]=(bank[i-2]+2*bank[i-1]+4*bank[i]+2*bank[i+1]+bank[i+2])/10;
    bank=next;
  }
  const routeStart=(out[0]?.cum||0)<=1;
  for(let i=0;i<n;i++){
    const straight=Math.abs(coarseTurn[i])<.030;
    let roll=straight?0:Math.max(-maxBank,Math.min(maxBank,bank[i]));
    if(Math.abs(roll)<.0012)roll=0;
    if(routeStart&&out[i].cum<=50)roll=0;
    out[i].roll=roll;
  }
  return out;
}

export function engineerVerticalProfileV21_31(source,{bridgeHeightAtCum,bridgeManager}={}){
  const n=source.length;
  if(n<9)return source.map(p=>p.y);
  let heights=source.map(p=>p.y);
  const halfWindow=30;
  for(let pass=0;pass<4;pass++){
    const next=heights.slice();
    for(let i=1;i<n-1;i++){
      const cum=source[i].cum;
      const bridgeY=typeof bridgeHeightAtCum==='function'?bridgeHeightAtCum(cum):null;
      if(bridgeY!==null){next[i]=bridgeY;continue;}
      let sum=0,weightSum=0;
      for(let k=-halfWindow;k<=halfWindow;k++){
        const j=i+k;if(j<0||j>=n)continue;
        const w=halfWindow+1-Math.abs(k);sum+=heights[j]*w;weightSum+=w;
      }
      const trend=weightSum?sum/weightSum:heights[i];
      const nearBridge=typeof bridgeManager?.isNearApproach==='function'&&bridgeManager.isNearApproach(cum,45);
      next[i]=heights[i]+(trend-heights[i])*(nearBridge?.18:.94);
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
  if(!Array.isArray(profile)||profile.length<5)return Array.isArray(profile)?profile.map(p=>({...p,roll:0})):[];
  const source=stripLegacyTerrainAuthorityV21_31(profile);
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
      const d=Math.hypot(dx,dz),maxDrift=1.35;
      if(d>maxDrift&&d>1e-6){const s=maxDrift/d;dx*=s;dz*=s;}
      next[i]={x:ox+dx,z:oz+dz};
    }
    xy=next;
  }
  for(let i=0;i<source.length;i++){
    if(typeof terrainAbs==='function')source[i].y=terrainAbs(xy[i].x,xy[i].z);
    source[i].x=xy[i].x;source[i].z=xy[i].z;source[i].roll=0;
  }
  const heights=engineerVerticalProfileV21_31(source,{bridgeHeightAtCum,bridgeManager});
  const routeStart=(source[0]?.cum||0)<=1;
  const startY=source[0]?.y||0;
  const START_FLAT=28;
  const START_BLEND_END=115;
  const rounded=source.map((p,i)=>{
    let y=heights[i];
    if(routeStart){
      if(p.cum<=START_FLAT)y=startY;
      else if(p.cum<START_BLEND_END){
        const t=smoothstep01((p.cum-START_FLAT)/(START_BLEND_END-START_FLAT));
        y=startY+(y-startY)*t;
      }
    }
    const bridgeY=typeof bridgeHeightAtCum==='function'?bridgeHeightAtCum(p.cum):null;
    if(bridgeY!==null)y=bridgeY;
    if(typeof terrainAbs==='function'&&bridgeY===null&&!(routeStart&&p.cum<=START_BLEND_END)){
      const ground=terrainAbs(p.x,p.z);
      if(Number.isFinite(ground))y=Math.max(ground-18,Math.min(ground+18,y));
    }
    return {...p,y,roll:0};
  });
  return applyRoadSuperelevationV21_31(rounded);
}

export function createRoadGeometrySystem(args={}){
  const base=createBaseRoadGeometrySystem(args);
  return Object.freeze({
    ...base,
    buildProfile(){
      base.syncState?.();
      return smoothRoadProfileV21_31(sampleRoutePlanarV21_31(args),args);
    }
  });
}

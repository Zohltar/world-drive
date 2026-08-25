// World Drive V21.25 — road profile, surface queries and visible road mesh geometry.
// Owns local road-profile/index state; main.js remains the world/physics orchestrator.

export function createRoadGeometrySystem({
  THREE,
  roadEdgeMat,
  roadUnderMat,
  ROAD_SURFACE_OFFSET,
  terrainAbs,
  nearestRoute,
  bridgeHeightAtCum,
  bridgeManager,
  getState
}){
  if(!THREE)throw new Error('road geometry requires THREE');
  if(typeof terrainAbs!=='function')throw new Error('road geometry requires terrainAbs');
  if(typeof nearestRoute!=='function')throw new Error('road geometry requires nearestRoute');
  if(typeof bridgeHeightAtCum!=='function')throw new Error('road geometry requires bridgeHeightAtCum');
  if(!bridgeManager||typeof bridgeManager.isNearApproach!=='function')throw new Error('road geometry requires bridgeManager');
  if(typeof getState!=='function')throw new Error('road geometry requires getState');

  let absX=0;
  let absZ=0;
  let routeLength=0;
  let segments=[];
  let worldOffset={x:0,z:0};

  function syncState(){
    const state=getState()||{};
    absX=Number(state.absX)||0;
    absZ=Number(state.absZ)||0;
    routeLength=Math.max(0,Number(state.routeLength)||0);
    segments=Array.isArray(state.segments)?state.segments:[];
    worldOffset=state.worldOffset||worldOffset;
  }
// ---------- continuous road ribbon ----------
// V21.19 — robust lateral frames for extreme mountain roads.
//
// A simple "next - previous" normal works on gentle curves, but on very sharp
// hairpins it can rotate or grow unpredictably. Every road layer then builds a
// slightly different twisted quad and the wider shoulder can poke through the
// asphalt as diagonal beige wedges. Use one bounded miter frame for every road
// layer so asphalt, shoulders, edge lines and the solid road body agree exactly.
function roadLateralFrame(points,i){
  const p=points[i];

  function unitSegment(a,b){
    let x=b.x-a.x;
    let z=b.z-a.z;
    const len=Math.hypot(x,z);
    if(len<1e-5)return null;
    return {x:x/len,z:z/len};
  }

  let incoming=i>0?unitSegment(points[i-1],p):null;
  let outgoing=i<points.length-1?unitSegment(p,points[i+1]):null;

  if(!incoming){
    for(let k=i-1;k>=0&&!incoming;k--)incoming=unitSegment(points[k],p);
  }
  if(!outgoing){
    for(let k=i+1;k<points.length&&!outgoing;k++)outgoing=unitSegment(p,points[k]);
  }

  const base=outgoing||incoming||{x:0,z:1};
  const baseNormal={x:-base.z,z:base.x};

  if(!incoming||!outgoing){
    return {x:baseNormal.x,z:baseNormal.z,scale:1};
  }

  const n0={x:-incoming.z,z:incoming.x};
  const n1={x:-outgoing.z,z:outgoing.x};
  const dot=Math.max(-1,Math.min(1,incoming.x*outgoing.x+incoming.z*outgoing.z));
  const turnAngle=Math.acos(dot);

  // V21.31 P3.4 — extreme hairpins use a bevel-like outgoing frame instead of
  // a stretched miter that can span the switchback interior as a giant quad.
  if(turnAngle>95*Math.PI/180){
    return {x:n1.x,z:n1.z,scale:1};
  }

  let mx=n0.x+n1.x;
  let mz=n0.z+n1.z;
  const ml=Math.hypot(mx,mz);

  if(ml<0.18){
    return {x:n1.x,z:n1.z,scale:1};
  }

  mx/=ml;
  mz/=ml;

  if(mx*n1.x+mz*n1.z<0){
    mx=-mx;
    mz=-mz;
  }

  const denom=Math.abs(mx*n1.x+mz*n1.z);
  let scale=denom>0.15?1/denom:1;
  scale=Math.max(0.92,Math.min(1.30,scale));

  return {x:mx*scale,z:mz*scale,scale};
}

function buildLateralBand(points,leftOffset,rightOffset,material,yOffset=0){
  if(points.length<2)return null;

  const pos=[],uv=[],idx=[];
  let cumulative=0;

  for(let i=0;i<points.length;i++){
    const p=points[i];
    const lat=roadLateralFrame(points,i);

    if(i>0)cumulative+=Math.hypot(
      p.x-points[i-1].x,
      p.z-points[i-1].z
    );

    const roll=Number.isFinite(p.roll)?p.roll:0;
    const rollSlope=Math.tan(roll);

    const pushOffset=(off)=>{
      const effectiveOff=off*lat.scale;
      pos.push(
        p.x-worldOffset.x+lat.x*off,
        p.y+yOffset+rollSlope*effectiveOff,
        p.z-worldOffset.z+lat.z*off
      );
    };

    pushOffset(leftOffset);
    pushOffset(rightOffset);
    uv.push(0,cumulative/8,1,cumulative/8);

    if(i<points.length-1){
      const a=i*2;
      idx.push(a,a+2,a+1,a+2,a+3,a+1);
    }
  }

  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);
  g.computeVertexNormals();

  const m=new THREE.Mesh(g,material);
  m.receiveShadow=true;
  return m;
}

function buildRibbon(points,width,material,yOffset=0){
  const half=width/2;
  return buildLateralBand(points,half,-half,material,yOffset);
}

function buildOffsetRibbon(points,offset,width,material,yOffset=0){
  const half=width/2;
  return buildLateralBand(points,offset+half,offset-half,material,yOffset);
}

function buildRoadVolume(profile){
  if(profile.length<2)return null;
  const group=new THREE.Group();
  const asphaltHalf=3.75,shoulderHalf=5.20,toeHalf=5.95;
  const asphaltTop=.10,shoulderTop=.035,slabBottom=-.20,toeBottom=-.36;
  const edgePos=[],edgeIdx=[],underPos=[],underIdx=[];

  function basisAt(i){
    const p=profile[i];
    const lat=roadLateralFrame(profile,i);
    return {p,nx:lat.x,nz:lat.z,lateralScale:lat.scale};
  }

  for(let i=0;i<profile.length;i++){
    const {p,nx,nz,lateralScale}=basisAt(i);
    const roll=Number.isFinite(p.roll)?p.roll:0;
    const rollSlope=Math.tan(roll);
    const push=(off,y)=>edgePos.push(p.x-worldOffset.x+nx*off,p.y+y+rollSlope*(off*lateralScale),p.z-worldOffset.z+nz*off);
    push(toeHalf,toeBottom);push(shoulderHalf,shoulderTop);push(asphaltHalf,slabBottom);push(asphaltHalf,asphaltTop);
    push(-asphaltHalf,asphaltTop);push(-asphaltHalf,slabBottom);push(-shoulderHalf,shoulderTop);push(-toeHalf,toeBottom);
    underPos.push(
      p.x-worldOffset.x+nx*asphaltHalf,p.y+slabBottom+rollSlope*(asphaltHalf*lateralScale),p.z-worldOffset.z+nz*asphaltHalf,
      p.x-worldOffset.x-nx*asphaltHalf,p.y+slabBottom-rollSlope*(asphaltHalf*lateralScale),p.z-worldOffset.z-nz*asphaltHalf
    );
  }

  const row=8;
  for(let i=0;i<profile.length-1;i++){
    const a=i*row,b=(i+1)*row;
    edgeIdx.push(a+0,b+0,a+1,a+1,b+0,b+1,a+1,b+1,a+2,a+2,b+1,b+2,a+2,b+2,a+3,a+3,b+2,b+3,
      a+4,b+4,a+5,a+5,b+4,b+5,a+5,b+5,a+6,a+6,b+5,b+6,a+6,b+6,a+7,a+7,b+6,b+7);
    const u=i*2,v=(i+1)*2;underIdx.push(u,v,u+1,u+1,v,v+1);
  }

  const edgeGeom=new THREE.BufferGeometry();
  edgeGeom.setAttribute('position',new THREE.Float32BufferAttribute(edgePos,3));edgeGeom.setIndex(edgeIdx);edgeGeom.computeVertexNormals();
  const edges=new THREE.Mesh(edgeGeom,roadEdgeMat);edges.castShadow=true;edges.receiveShadow=true;edges.renderOrder=1;group.add(edges);
  const underGeom=new THREE.BufferGeometry();
  underGeom.setAttribute('position',new THREE.Float32BufferAttribute(underPos,3));underGeom.setIndex(underIdx);underGeom.computeVertexNormals();
  const underside=new THREE.Mesh(underGeom,roadUnderMat);underside.castShadow=true;underside.receiveShadow=true;underside.renderOrder=0;group.add(underside);
  return group;
}

function buildRoadProfile(){
  const nr=nearestRoute(absX,absZ);
  const centerCum=nr?.cum||0;
  const minCum=Math.max(0,centerCum-1800);
  const maxCum=Math.min(routeLength,centerCum+3600);
  const raw=[];
  let lastIncluded=null;

  for(const seg of segments){
    const segStart=seg.cum;
    const segEnd=seg.cum+seg.len;
    if(segEnd<minCum||segStart>maxCum)continue;
    const t0=seg.len>0?Math.max(0,(minCum-segStart)/seg.len):0;
    const t1=seg.len>0?Math.min(1,(maxCum-segStart)/seg.len):1;
    if(t1<t0)continue;
    const sampledLen=Math.max(0,seg.len*(t1-t0));
    const steps=Math.max(1,Math.ceil(sampledLen/3));
    for(let k=0;k<steps;k++){
      const u=k/steps,t=t0+(t1-t0)*u;
      const x=seg.ax+(seg.bx-seg.ax)*t,z=seg.az+(seg.bz-seg.az)*t,cum=segStart+seg.len*t;
      if(!raw.length||Math.hypot(x-raw[raw.length-1].x,z-raw[raw.length-1].z)>.4)raw.push({x,z,y:terrainAbs(x,z),cum});
    }
    lastIncluded={seg,t:t1};
  }
  if(!raw.length)return raw;

  if(lastIncluded){
    const {seg,t}=lastIncluded;
    const x=seg.ax+(seg.bx-seg.ax)*t,z=seg.az+(seg.bz-seg.az)*t,cum=seg.cum+seg.len*t;
    if(Math.hypot(x-raw[raw.length-1].x,z-raw[raw.length-1].z)>.05)raw.push({x,z,y:terrainAbs(x,z),cum});
  }

  let heights=raw.map(p=>p.y);
  for(let pass=0;pass<2;pass++){
    const h2=heights.slice();
    for(let i=2;i<heights.length-2;i++)h2[i]=(heights[i-2]+2*heights[i-1]+4*heights[i]+2*heights[i+1]+heights[i+2])/10;
    heights=h2;
  }
  for(let i=0;i<raw.length;i++){const by=bridgeHeightAtCum(raw[i].cum);if(by!==null)heights[i]=by;}
  const finalH=heights.slice();
  for(let i=1;i<heights.length-1;i++)if(bridgeHeightAtCum(raw[i].cum)===null&&bridgeManager.isNearApproach(raw[i].cum,18))finalH[i]=(heights[i-1]+2*heights[i]+heights[i+1])/4;

  const hasRouteStart=(raw[0]?.cum||0)<=1;
  const startPlatformY=finalH[0];
  const START_FLAT_LENGTH=28,START_BLEND_LENGTH=72,START_BLEND_END=START_FLAT_LENGTH+START_BLEND_LENGTH;
  function startProfileWeight(cum){
    if(!hasRouteStart)return 1;
    const d=Math.max(0,cum);if(d<=START_FLAT_LENGTH)return 0;if(d>=START_BLEND_END)return 1;
    const t=(d-START_FLAT_LENGTH)/START_BLEND_LENGTH;return t*t*(3-2*t);
  }
  const startSafeH=finalH.map((height,i)=>startPlatformY+(height-startPlatformY)*startProfileWeight(raw[i].cum));

  const rollProbe=5.6,rawRoll=new Array(raw.length).fill(0);
  for(let i=0;i<raw.length;i++){
    const p=raw[i],prev=raw[Math.max(0,i-1)],next=raw[Math.min(raw.length-1,i+1)];
    let tx=next.x-prev.x,tz=next.z-prev.z;const tl=Math.hypot(tx,tz)||1;tx/=tl;tz/=tl;
    const nx=-tz,nz=tx,leftY=terrainAbs(p.x+nx*rollProbe,p.z+nz*rollProbe),rightY=terrainAbs(p.x-nx*rollProbe,p.z-nz*rollProbe);
    rawRoll[i]=Math.atan2(leftY-rightY,rollProbe*2);
  }
  let smoothedRoll=rawRoll;
  for(let pass=0;pass<3;pass++){
    const nextRoll=smoothedRoll.slice();
    for(let i=2;i<smoothedRoll.length-2;i++)nextRoll[i]=(smoothedRoll[i-2]+2*smoothedRoll[i-1]+4*smoothedRoll[i]+2*smoothedRoll[i+1]+smoothedRoll[i+2])/10;
    smoothedRoll=nextRoll;
  }
  const maxRoadRoll=12*Math.PI/180;
  return raw.map((p,i)=>({x:p.x,z:p.z,y:startSafeH[i],cum:p.cum,roll:startProfileWeight(p.cum)*Math.max(-maxRoadRoll,Math.min(maxRoadRoll,smoothedRoll[i]))}));
}

const activeRoadProfile=[];
const ROAD_PROFILE_INDEX_CELL=48;
let roadProfileSpatialIndex=new Map();
let roadProfileVisitMarks=new Uint32Array(0);
let roadProfileVisitStamp=1;
const roadFrameSearchState={found:false,bd:Infinity,y:0,angle:0,pitch:0,roll:0,px:0,pz:0,index:0,t:0,distance:0};

function roadProfileCellList(cx,cz,create=false){
  let column=roadProfileSpatialIndex.get(cx);
  if(!column){if(!create)return null;column=new Map();roadProfileSpatialIndex.set(cx,column);}
  let list=column.get(cz);if(!list&&create){list=[];column.set(cz,list);}return list;
}

function rebuildRoadProfileSpatialIndex(){
  roadProfileSpatialIndex=new Map();
  const segmentCount=Math.max(0,activeRoadProfile.length-1);
  if(roadProfileVisitMarks.length<segmentCount)roadProfileVisitMarks=new Uint32Array(segmentCount);
  for(let i=0;i<segmentCount;i++){
    const a=activeRoadProfile[i],b=activeRoadProfile[i+1];
    const minX=Math.min(a.x,b.x)-8,maxX=Math.max(a.x,b.x)+8,minZ=Math.min(a.z,b.z)-8,maxZ=Math.max(a.z,b.z)+8;
    const cx0=Math.floor(minX/ROAD_PROFILE_INDEX_CELL),cx1=Math.floor(maxX/ROAD_PROFILE_INDEX_CELL),cz0=Math.floor(minZ/ROAD_PROFILE_INDEX_CELL),cz1=Math.floor(maxZ/ROAD_PROFILE_INDEX_CELL);
    for(let cx=cx0;cx<=cx1;cx++)for(let cz=cz0;cz<=cz1;cz++)roadProfileCellList(cx,cz,true).push(i);
  }
}

function setActiveRoadProfile(profile){activeRoadProfile.length=0;if(Array.isArray(profile))activeRoadProfile.push(...profile);rebuildRoadProfileSpatialIndex();return activeRoadProfile;}
function clearActiveRoadProfile(){activeRoadProfile.length=0;roadProfileSpatialIndex=new Map();}

function roadProfileFrameAtCum(cum){
  if(activeRoadProfile.length<2)return null;
  const target=Math.max(activeRoadProfile[0].cum,Math.min(activeRoadProfile[activeRoadProfile.length-1].cum,cum));
  let lo=0,hi=activeRoadProfile.length-1;
  while(lo+1<hi){const mid=(lo+hi)>>1;if(activeRoadProfile[mid].cum<=target)lo=mid;else hi=mid;}
  const a=activeRoadProfile[lo],b=activeRoadProfile[Math.min(lo+1,activeRoadProfile.length-1)];
  const span=Math.max(1e-6,b.cum-a.cum),t=Math.max(0,Math.min(1,(target-a.cum)/span));
  const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1,nx=-dz/len,nz=dx/len;
  return {y:a.y+(b.y-a.y)*t,roll:(a.roll||0)+((b.roll||0)-(a.roll||0))*t,angle:Math.atan2(dx,dz),pitch:Math.atan2(b.y-a.y,len),px:a.x+dx*t,pz:a.z+dz*t,nx,nz,index:lo,t,cum:target};
}

function roadFrameAt(x,z,maxDistance=26){
  if(activeRoadProfile.length<2)return null;
  let stamp=++roadProfileVisitStamp;if(stamp===0){roadProfileVisitMarks.fill(0);roadProfileVisitStamp=stamp=1;}
  const cx=Math.floor(x/ROAD_PROFILE_INDEX_CELL),cz=Math.floor(z/ROAD_PROFILE_INDEX_CELL),out=roadFrameSearchState;
  out.found=false;out.bd=Infinity;
  for(let ox=-1;ox<=1;ox++)for(let oz=-1;oz<=1;oz++){
    const list=roadProfileCellList(cx+ox,cz+oz,false);if(!list)continue;
    for(const i of list){
      if(roadProfileVisitMarks[i]===stamp)continue;roadProfileVisitMarks[i]=stamp;
      const a=activeRoadProfile[i],b=activeRoadProfile[i+1],vx=b.x-a.x,vz=b.z-a.z,vv=vx*vx+vz*vz||1;
      const t=Math.max(0,Math.min(1,((x-a.x)*vx+(z-a.z)*vz)/vv)),px=a.x+t*vx,pz=a.z+t*vz,dx=x-px,dz=z-pz,d2=dx*dx+dz*dz;
      if(d2<out.bd){const len=Math.sqrt(vv);out.found=true;out.bd=d2;out.y=a.y+(b.y-a.y)*t;out.angle=Math.atan2(vx,vz);out.pitch=Math.atan2(b.y-a.y,len);out.roll=(a.roll||0)+((b.roll||0)-(a.roll||0))*t;out.px=px;out.pz=pz;out.nx=-vz/len;out.nz=vx/len;out.index=i;out.t=t;out.distance=Math.sqrt(d2);}
    }
  }
  return out.found&&out.distance<=maxDistance?out:null;
}

function roadHeightAt(x,z){const frame=roadFrameAt(x,z,24);return frame?frame.y:null;}
function roadSurfaceAt(x,z){const frame=roadFrameAt(x,z,26);if(!frame)return null;const lateral=(x-frame.px)*frame.nx+(z-frame.pz)*frame.nz;return {...frame,y:frame.y+Math.tan(frame.roll||0)*lateral,lateral};}

// Deliberately do NOT call syncState() here. main.js constructs this system before
// its absX/absZ runtime variables leave the temporal dead zone. State is synced
// lazily by buildProfile() or explicitly by callers once initialization is complete.
return Object.freeze({
  profile:activeRoadProfile,
  syncState,
  buildProfile(){syncState();return buildRoadProfile();},
  setProfile:setActiveRoadProfile,
  clearProfile:clearActiveRoadProfile,
  rebuildIndex:rebuildRoadProfileSpatialIndex,
  buildLateralBand,
  buildRibbon,
  buildOffsetRibbon,
  buildRoadVolume,
  roadFrameAt,
  roadProfileFrameAtCum,
  roadHeightAt,
  roadSurfaceAt
});
}

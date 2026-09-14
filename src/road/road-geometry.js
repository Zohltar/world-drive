// World Drive C3 — canonical road geometry ownership.
// The former V21.25 base and V21.31 smoothing wrapper now live in one module;
// equations and frame ordering are unchanged.

// World Drive V21.25 — road profile, surface queries and visible road mesh geometry.
// Owns local road-profile/index state; main.js remains the world/physics orchestrator.

function monotoneRoadSlope(incoming,outgoing){
  if(!Number.isFinite(incoming)||!Number.isFinite(outgoing)||incoming*outgoing<=0)return 0;
  return Math.sign(incoming)*Math.min(
    (Math.abs(incoming)+Math.abs(outgoing))*.5,
    3*Math.min(Math.abs(incoming),Math.abs(outgoing))
  );
}

function createRoadGeometryCore({
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
  let routeClosedLoop=false;

  function finiteNumber(value,fallback){
    const number=Number(value);
    return Number.isFinite(number)?number:fallback;
  }

  function boundedNumber(value,fallback,min,max){
    return Math.max(min,Math.min(max,finiteNumber(value,fallback)));
  }

  function finiteRoadMeshPoints(points){
    if(!Array.isArray(points))return [];
    const isFinitePoint=point=>
      point&&Number.isFinite(point.x)&&Number.isFinite(point.y)&&Number.isFinite(point.z);
    return points.every(isFinitePoint)?points:points.filter(isFinitePoint);
  }

  function roadMeshOffset(explicitOffset){
    const candidates=[explicitOffset,worldOffset];
    for(const candidate of candidates){
      const x=Number(candidate?.x),z=Number(candidate?.z);
      if(Number.isFinite(x)&&Number.isFinite(z))return {x,z};
    }
    return {x:0,z:0};
  }

  function syncState(){
    const state=getState()||{};
    absX=Number(state.absX)||0;
    absZ=Number(state.absZ)||0;
    routeLength=Math.max(0,Number(state.routeLength)||0);
    segments=Array.isArray(state.segments)?state.segments:[];
    const nextOffset=roadMeshOffset(state.worldOffset);
    worldOffset=nextOffset;
    routeClosedLoop=!!state.routeClosedLoop;
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
    if(!Number.isFinite(len)||len<1e-5)return null;
    return {x:x/len,z:z/len};
  }

  const lastIndex=points.length-1;
  const closed=points.length>3&&Math.hypot(
    points[0].x-points[lastIndex].x,
    points[0].z-points[lastIndex].z
  )<.5;
  let incoming=i>0?unitSegment(points[i-1],p):null;
  let outgoing=i<lastIndex?unitSegment(p,points[i+1]):null;
  if(closed&&i===0)incoming=unitSegment(points[lastIndex-1],p);
  if(closed&&i===lastIndex)outgoing=unitSegment(p,points[1]);

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

function buildLateralBand(points,leftOffset,rightOffset,material,yOffset=0,explicitOffset=null){
  const meshPoints=finiteRoadMeshPoints(points);
  const left=Number(leftOffset),right=Number(rightOffset);
  if(meshPoints.length<2||!Number.isFinite(left)||!Number.isFinite(right))return null;
  const renderOffset=roadMeshOffset(explicitOffset);
  const verticalOffset=finiteNumber(yOffset,0);

  const pos=[],uv=[],idx=[];
  let cumulative=0;

  for(let i=0;i<meshPoints.length;i++){
    const p=meshPoints[i];
    const lat=roadLateralFrame(meshPoints,i);

    if(i>0)cumulative+=Math.hypot(
      p.x-meshPoints[i-1].x,
      p.z-meshPoints[i-1].z
    );

    const roll=Number.isFinite(p.roll)?p.roll:0;
    const rollSlope=Math.tan(roll);

    const pushOffset=(off)=>{
      const effectiveOff=off*lat.scale;
      pos.push(
        p.x-renderOffset.x+lat.x*off,
        p.y+verticalOffset+rollSlope*effectiveOff,
        p.z-renderOffset.z+lat.z*off
      );
    };

    pushOffset(left);
    pushOffset(right);
    uv.push(0,cumulative/8,1,cumulative/8);

    if(i<meshPoints.length-1){
      const a=i*2;
      idx.push(a,a+2,a+1,a+2,a+3,a+1);
    }
  }

  const g=new THREE.BufferGeometry();
  g.userData.worldDriveGeometry='road-lateral-band';
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);
  g.computeVertexNormals();

  const m=new THREE.Mesh(g,material);
  m.receiveShadow=true;
  return m;
}

function buildRibbon(points,width,material,yOffset=0,explicitOffset=null){
  const half=width/2;
  return buildLateralBand(points,half,-half,material,yOffset,explicitOffset);
}

function buildOffsetRibbon(points,offset,width,material,yOffset=0,explicitOffset=null){
  const half=width/2;
  return buildLateralBand(points,offset+half,offset-half,material,yOffset,explicitOffset);
}

function buildRoadVolume(profile,roadSpec=null,explicitOffset=null){
  const meshProfile=finiteRoadMeshPoints(profile);
  if(meshProfile.length<2)return null;
  const renderOffset=roadMeshOffset(explicitOffset);
  const group=new THREE.Group();
  group.userData.worldDriveGeometry='road-volume';
  const asphaltWidth=boundedNumber(roadSpec?.asphaltWidthM,7.5,5.5,20);
  const asphaltHalf=asphaltWidth/2;
  const shoulderWidth=boundedNumber(roadSpec?.shoulderWidthM,1.45,0,4);
  const shoulderHalf=asphaltHalf+shoulderWidth;
  const toeHalf=shoulderHalf+.75;
  const asphaltTop=.10,shoulderTop=.035,slabBottom=-.20,toeBottom=-.36;
  const edgePos=[],edgeIdx=[],underPos=[],underIdx=[];

  function basisAt(i){
    const p=meshProfile[i];
    const lat=roadLateralFrame(meshProfile,i);
    return {p,nx:lat.x,nz:lat.z,lateralScale:lat.scale};
  }

  for(let i=0;i<meshProfile.length;i++){
    const {p,nx,nz,lateralScale}=basisAt(i);
    const roll=Number.isFinite(p.roll)?p.roll:0;
    const rollSlope=Math.tan(roll);
    const push=(off,y)=>edgePos.push(p.x-renderOffset.x+nx*off,p.y+y+rollSlope*(off*lateralScale),p.z-renderOffset.z+nz*off);
    push(toeHalf,toeBottom);push(shoulderHalf,shoulderTop);push(asphaltHalf,slabBottom);push(asphaltHalf,asphaltTop);
    push(-asphaltHalf,asphaltTop);push(-asphaltHalf,slabBottom);push(-shoulderHalf,shoulderTop);push(-toeHalf,toeBottom);
    underPos.push(
      p.x-renderOffset.x+nx*asphaltHalf,p.y+slabBottom+rollSlope*(asphaltHalf*lateralScale),p.z-renderOffset.z+nz*asphaltHalf,
      p.x-renderOffset.x-nx*asphaltHalf,p.y+slabBottom-rollSlope*(asphaltHalf*lateralScale),p.z-renderOffset.z-nz*asphaltHalf
    );
  }

  const row=8;
  for(let i=0;i<meshProfile.length-1;i++){
    const a=i*row,b=(i+1)*row;
    edgeIdx.push(a+0,b+0,a+1,a+1,b+0,b+1,a+1,b+1,a+2,a+2,b+1,b+2,a+2,b+2,a+3,a+3,b+2,b+3,
      a+4,b+4,a+5,a+5,b+4,b+5,a+5,b+5,a+6,a+6,b+5,b+6,a+6,b+6,a+7,a+7,b+6,b+7);
    const u=i*2,v=(i+1)*2;underIdx.push(u,v,u+1,u+1,v,v+1);
  }

  const edgeGeom=new THREE.BufferGeometry();
  edgeGeom.userData.worldDriveGeometry='road-volume-edges';
  edgeGeom.setAttribute('position',new THREE.Float32BufferAttribute(edgePos,3));edgeGeom.setIndex(edgeIdx);edgeGeom.computeVertexNormals();
  const edges=new THREE.Mesh(edgeGeom,roadEdgeMat);edges.castShadow=true;edges.receiveShadow=true;edges.renderOrder=1;group.add(edges);
  const underGeom=new THREE.BufferGeometry();
  underGeom.userData.worldDriveGeometry='road-volume-underside';
  underGeom.setAttribute('position',new THREE.Float32BufferAttribute(underPos,3));underGeom.setIndex(underIdx);underGeom.computeVertexNormals();
  const underside=new THREE.Mesh(underGeom,roadUnderMat);underside.castShadow=true;underside.receiveShadow=true;underside.renderOrder=0;group.add(underside);
  return group;
}

function buildRoadProfile(){
  const nr=nearestRoute(absX,absZ);
  const centerCum=nr?.cum||0;
  const keepWholeClosedLoop=routeClosedLoop&&routeLength<=5000;
  const minCum=keepWholeClosedLoop?0:Math.max(0,centerCum-1800);
  const maxCum=keepWholeClosedLoop?routeLength:Math.min(routeLength,centerCum+3600);
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

  const hasRouteStart=!routeClosedLoop&&(raw[0]?.cum||0)<=1;
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
    const lastIndex=raw.length-1;
    const p=raw[i];
    const prev=routeClosedLoop&&raw.length>3&&i===0?raw[lastIndex-1]:raw[Math.max(0,i-1)];
    const next=routeClosedLoop&&raw.length>3&&i===lastIndex?raw[1]:raw[Math.min(lastIndex,i+1)];
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
  const profile=raw.map((p,i)=>({x:p.x,z:p.z,y:startSafeH[i],cum:p.cum,roll:startProfileWeight(p.cum)*Math.max(-maxRoadRoll,Math.min(maxRoadRoll,smoothedRoll[i]))}));
  if(routeClosedLoop&&profile.length>2&&Math.hypot(profile[0].x-profile.at(-1).x,profile[0].z-profile.at(-1).z)<.5){
    profile[profile.length-1].x=profile[0].x;
    profile[profile.length-1].z=profile[0].z;
    profile[profile.length-1].y=profile[0].y;
    profile[profile.length-1].roll=profile[0].roll;
  }
  return profile;
}

const activeRoadProfile=[];
const activeRoadTangents=[];
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

function rebuildRoadProfileTangents(){
  activeRoadTangents.length=activeRoadProfile.length;
  const count=activeRoadProfile.length;
  if(count<2)return;
  const closed=count>3&&Math.hypot(
    activeRoadProfile[0].x-activeRoadProfile[count-1].x,
    activeRoadProfile[0].z-activeRoadProfile[count-1].z
  )<.5;
  const uniqueCount=closed?count-1:count;

  function segmentSlope(a,b){
    const distance=Math.hypot(b.x-a.x,b.z-a.z);
    if(distance<1e-6)return {x:0,z:1,grade:0};
    return {
      x:(b.x-a.x)/distance,
      z:(b.z-a.z)/distance,
      grade:(b.y-a.y)/distance
    };
  }

  for(let i=0;i<uniqueCount;i++){
    const point=activeRoadProfile[i];
    let incoming=null,outgoing=null;
    if(i>0)incoming=segmentSlope(activeRoadProfile[i-1],point);
    else if(closed)incoming=segmentSlope(activeRoadProfile[uniqueCount-1],point);
    if(i<uniqueCount-1)outgoing=segmentSlope(point,activeRoadProfile[i+1]);
    else if(closed)outgoing=segmentSlope(point,activeRoadProfile[0]);

    const base=outgoing||incoming||{x:0,z:1,grade:0};
    let tx=base.x,tz=base.z;
    if(incoming&&outgoing){
      tx=incoming.x+outgoing.x;
      tz=incoming.z+outgoing.z;
      const length=Math.hypot(tx,tz);
      if(length>.12){tx/=length;tz/=length;}else{tx=base.x;tz=base.z;}
    }
    activeRoadTangents[i]={
      x:tx,
      z:tz,
      grade:incoming&&outgoing
        ?monotoneRoadSlope(incoming.grade,outgoing.grade)
        :base.grade
    };
  }
  if(closed)activeRoadTangents[count-1]={...activeRoadTangents[0]};
}

function setRoadFrameOrientation(out,index,t,fallbackX,fallbackZ){
  const a=activeRoadTangents[index];
  const b=activeRoadTangents[Math.min(index+1,activeRoadTangents.length-1)];
  let tx=(a?.x??fallbackX)+((b?.x??fallbackX)-(a?.x??fallbackX))*t;
  let tz=(a?.z??fallbackZ)+((b?.z??fallbackZ)-(a?.z??fallbackZ))*t;
  const length=Math.hypot(tx,tz);
  if(length>.12){tx/=length;tz/=length;}else{tx=fallbackX;tz=fallbackZ;}
  const grade=(a?.grade||0)+((b?.grade||0)-(a?.grade||0))*t;
  out.angle=Math.atan2(tx,tz);
  out.pitch=Math.atan(grade);
  out.nx=-tz;
  out.nz=tx;
  return out;
}

function setActiveRoadProfile(profile){
  activeRoadProfile.length=0;
  if(Array.isArray(profile))activeRoadProfile.push(...profile);
  rebuildRoadProfileTangents();
  rebuildRoadProfileSpatialIndex();
  return activeRoadProfile;
}
function clearActiveRoadProfile(){activeRoadProfile.length=0;activeRoadTangents.length=0;roadProfileSpatialIndex=new Map();}

function roadProfileFrameAtCum(cum){
  if(activeRoadProfile.length<2)return null;
  const target=Math.max(activeRoadProfile[0].cum,Math.min(activeRoadProfile[activeRoadProfile.length-1].cum,cum));
  let lo=0,hi=activeRoadProfile.length-1;
  while(lo+1<hi){const mid=(lo+hi)>>1;if(activeRoadProfile[mid].cum<=target)lo=mid;else hi=mid;}
  const a=activeRoadProfile[lo],b=activeRoadProfile[Math.min(lo+1,activeRoadProfile.length-1)];
  const span=Math.max(1e-6,b.cum-a.cum),t=Math.max(0,Math.min(1,(target-a.cum)/span));
  const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1;
  const frame={y:a.y+(b.y-a.y)*t,roll:(a.roll||0)+((b.roll||0)-(a.roll||0))*t,angle:0,pitch:0,px:a.x+dx*t,pz:a.z+dz*t,nx:0,nz:0,index:lo,t,cum:target};
  return setRoadFrameOrientation(frame,lo,t,dx/len,dz/len);
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
      if(d2<out.bd){const len=Math.sqrt(vv);out.found=true;out.bd=d2;out.y=a.y+(b.y-a.y)*t;out.roll=(a.roll||0)+((b.roll||0)-(a.roll||0))*t;out.px=px;out.pz=pz;out.index=i;out.t=t;out.distance=Math.sqrt(d2);setRoadFrameOrientation(out,i,t,vx/len,vz/len);}
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

// World Drive V21.31 — bounded curve/crest smoothing over the proven road geometry base.
// Keeps the V21.30 road generator intact, then rounds routing-polyline corners and
// vertical DEM crests without allowing the road centreline to drift far from source.

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
export function engineerRoadBankingV21_31(profile,{closedLoop=false}={}){
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

  const routeStart=!closedLoop&&(out[0]?.cum||0)<=1;
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
  if(closedLoop&&out.length>1)out[out.length-1].roll=out[0].roll;
  return out;
}

export function smoothRoadProfileV21_31(profile,{terrainAbs,bridgeHeightAtCum,bridgeManager,closedLoop=false}={}){
  if(!Array.isArray(profile)||profile.length<5)return Array.isArray(profile)?engineerRoadBankingV21_31(profile,{closedLoop}):[];
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

  const routeStart=!closedLoop&&(source[0]?.cum||0)<=1;
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
  if(closedLoop&&rounded.length>2&&Math.hypot(rounded[0].x-rounded.at(-1).x,rounded[0].z-rounded.at(-1).z)<.5){
    rounded[rounded.length-1].x=rounded[0].x;
    rounded[rounded.length-1].z=rounded[0].z;
    rounded[rounded.length-1].y=rounded[0].y;
    rounded[rounded.length-1].roll=rounded[0].roll;
  }
  return engineerRoadBankingV21_31(rounded,{closedLoop});
}

const ROAD_SURFACE_BASE_STEP_M=1.5;
const ROAD_SURFACE_MAX_HEADING_STEP_RAD=2*Math.PI/180;
const ROAD_SURFACE_MAX_PITCH_STEP_RAD=.12*Math.PI/180;
const ROAD_SURFACE_MAX_ROLL_STEP_RAD=.30*Math.PI/180;
const ROAD_SURFACE_MAX_DETAIL_SUBDIVISIONS=10;
const ROAD_SURFACE_MAX_CHORD_DRIFT_M=.35;

function hermiteValue(a,b,ta,tb,span,t){
  const t2=t*t,t3=t2*t;
  return (2*t3-3*t2+1)*a+
    (t3-2*t2+t)*span*ta+
    (-2*t3+3*t2)*b+
    (t3-t2)*span*tb;
}

// Road surface R3 — V21.31 rounded the source samples, but the rendered ribbon
// and wheel support still joined those samples as coarse planar sections. On a
// tight curve or a changing grade this left visible facets and an instantaneous
// pitch/heading change at each join. Resample the engineered profile with a
// bounded Hermite curve: ordinary sections stay light, while curvature, grade
// and bank transitions receive enough sections to remain suspension-scale.
export function refineRoadSurfaceProfileV21_32(profile,{
  bridgeHeightAtCum,
  closedLoop=false
}={}){
  if(!Array.isArray(profile)||profile.length<3)return Array.isArray(profile)?profile.map(p=>({...p})):[];

  const source=profile.map(p=>({...p}));
  const lastIndex=source.length-1;
  const closes=!!closedLoop&&source.length>3&&Math.hypot(
    source[0].x-source[lastIndex].x,
    source[0].z-source[lastIndex].z
  )<.5;
  const uniqueCount=closes?source.length-1:source.length;
  const totalSpan=Math.max(1e-6,source[lastIndex].cum-source[0].cum);

  function wrappedPoint(rawIndex){
    if(!closes)return source[Math.max(0,Math.min(uniqueCount-1,rawIndex))];
    let index=rawIndex,cycle=0;
    while(index<0){index+=uniqueCount;cycle--;}
    while(index>=uniqueCount){index-=uniqueCount;cycle++;}
    if(!cycle)return source[index];
    return {...source[index],cum:source[index].cum+cycle*totalSpan};
  }

  function secant(a,b,key){
    const span=Math.max(1e-6,b.cum-a.cum);
    return ((Number(b[key])||0)-(Number(a[key])||0))/span;
  }

  function tangentAt(index){
    const point=wrappedPoint(index);
    if(!closes&&index===0){
      const next=wrappedPoint(1);
      return {
        x:secant(point,next,'x'),z:secant(point,next,'z'),
        y:secant(point,next,'y'),roll:secant(point,next,'roll')
      };
    }
    if(!closes&&index===uniqueCount-1){
      const previous=wrappedPoint(index-1);
      return {
        x:secant(previous,point,'x'),z:secant(previous,point,'z'),
        y:secant(previous,point,'y'),roll:secant(previous,point,'roll')
      };
    }

    const previous=wrappedPoint(index-1);
    const next=wrappedPoint(index+1);
    const incoming={
      x:secant(previous,point,'x'),z:secant(previous,point,'z'),
      y:secant(previous,point,'y'),roll:secant(previous,point,'roll')
    };
    const outgoing={
      x:secant(point,next,'x'),z:secant(point,next,'z'),
      y:secant(point,next,'y'),roll:secant(point,next,'roll')
    };
    return {
      x:(incoming.x+outgoing.x)*.5,
      z:(incoming.z+outgoing.z)*.5,
      y:monotoneRoadSlope(incoming.y,outgoing.y),
      roll:monotoneRoadSlope(incoming.roll,outgoing.roll)
    };
  }

  const tangents=Array.from({length:uniqueCount},(_,index)=>tangentAt(index));
  const refined=[];
  const segmentCount=closes?uniqueCount:uniqueCount-1;

  for(let i=0;i<segmentCount;i++){
    const a=wrappedPoint(i),b=wrappedPoint(i+1);
    const ta=tangents[i],tb=tangents[(i+1)%uniqueCount];
    const span=Math.max(1e-6,b.cum-a.cum);
    const chordLength=Math.hypot(b.x-a.x,b.z-a.z);
    const headingA=Math.atan2(ta.x,ta.z),headingB=Math.atan2(tb.x,tb.z);
    const pitchA=Math.atan2(ta.y,Math.hypot(ta.x,ta.z)||1);
    const pitchB=Math.atan2(tb.y,Math.hypot(tb.x,tb.z)||1);
    const baseSubdivisions=Math.max(1,Math.ceil(chordLength/ROAD_SURFACE_BASE_STEP_M));
    const detailSubdivisions=Math.min(ROAD_SURFACE_MAX_DETAIL_SUBDIVISIONS,Math.max(
      1,
      Math.ceil(Math.abs(angleDelta(headingA,headingB))/ROAD_SURFACE_MAX_HEADING_STEP_RAD),
      Math.ceil(Math.abs(pitchB-pitchA)/ROAD_SURFACE_MAX_PITCH_STEP_RAD),
      Math.ceil(Math.abs((b.roll||0)-(a.roll||0))/ROAD_SURFACE_MAX_ROLL_STEP_RAD)
    ));
    const subdivisions=Math.max(baseSubdivisions,detailSubdivisions);

    for(let step=0;step<subdivisions;step++){
      const t=step/subdivisions;
      const linearX=a.x+(b.x-a.x)*t;
      const linearZ=a.z+(b.z-a.z)*t;
      let x=hermiteValue(a.x,b.x,ta.x,tb.x,span,t);
      let z=hermiteValue(a.z,b.z,ta.z,tb.z,span,t);
      const driftX=x-linearX,driftZ=z-linearZ;
      const drift=Math.hypot(driftX,driftZ);
      if(drift>ROAD_SURFACE_MAX_CHORD_DRIFT_M){
        const scale=ROAD_SURFACE_MAX_CHORD_DRIFT_M/drift;
        x=linearX+driftX*scale;
        z=linearZ+driftZ*scale;
      }

      const cum=a.cum+span*t;
      const bridgeY=typeof bridgeHeightAtCum==='function'?bridgeHeightAtCum(cum):null;
      const y=bridgeY!==null&&Number.isFinite(bridgeY)
        ?bridgeY
        :hermiteValue(a.y,b.y,ta.y,tb.y,span,t);
      const roll=clampRoadBankV21_31(
        hermiteValue(a.roll||0,b.roll||0,ta.roll,tb.roll,span,t)
      );
      refined.push({...a,x,z,y,roll,cum});
    }
  }

  if(closes){
    refined.push({...refined[0],cum:source[lastIndex].cum});
  }else{
    refined.push({...source[lastIndex]});
  }
  return refined;
}

export function createRoadGeometrySystem(args={}){
  const base=createRoadGeometryCore(args);
  return Object.freeze({
    ...base,
    buildProfile(){
      const profile=base.buildProfile();
      const closedLoop=!!args.getState?.()?.routeClosedLoop;
      const smoothed=smoothRoadProfileV21_31(profile,{...args,closedLoop});
      return refineRoadSurfaceProfileV21_32(smoothed,{...args,closedLoop});
    }
  });
}

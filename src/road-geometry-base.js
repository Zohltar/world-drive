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

  // V21.31 P3.4 — bevel severe hairpins instead of stretching one mitered row
  // across the inside of the corner. The previous 1.48x miter cap still created
  // large diagonal asphalt/shoulder quads on Yungas-style switchbacks. Once the
  // heading changes by more than ~95 degrees, use the outgoing cross-section at
  // normal width. This trades a tiny local bevel for a guaranteed bounded join.
  const headingDot=Math.max(-1,Math.min(1,incoming.x*outgoing.x+incoming.z*outgoing.z));
  const severeHairpin=headingDot<Math.cos(95*Math.PI/180);
  if(severeHairpin){
    return {x:n1.x,z:n1.z,scale:1,bevel:true};
  }

  let mx=n0.x+n1.x;
  let mz=n0.z+n1.z;
  const ml=Math.hypot(mx,mz);

  // Near a 180° reversal the mathematical miter is undefined. A bounded
  // outgoing normal is visually far safer than an enormous spike.
  if(ml<0.18){
    return {x:n1.x,z:n1.z,scale:1,bevel:true};
  }

  mx/=ml;
  mz/=ml;

  if(mx*n1.x+mz*n1.z<0){
    mx=-mx;
    mz=-mz;
  }

  const denom=Math.abs(mx*n1.x+mz*n1.z);
  let scale=denom>0.15?1/denom:1;

  // Normal curves can keep a miter, but V21.31 lowers the maximum because the
  // large old 1.48x allowance was unnecessary once extreme joins are beveled.
  scale=Math.max(0.94,Math.min(1.30,scale));

  return {x:mx*scale,z:mz*scale,scale,bevel:false};
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

    // Vertices stay ordered left-to-right so triangle winding stays upward.
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
  return buildLateralBand(
    points,
    offset+half,
    offset-half,
    material,
    yOffset
  );
}

function buildRoadVolume(profile){
  if(profile.length<2)return null;

  const group=new THREE.Group();

  // Cross-section dimensions, in metres.
  const asphaltHalf=3.75;
  const shoulderHalf=5.20;
  const toeHalf=5.95;

  const asphaltTop=.10;
  const shoulderTop=.035;
  const slabBottom=-.20;
  const toeBottom=-.36;

  const edgePos=[];
  const edgeIdx=[];
  const underPos=[];
  const underIdx=[];

  function basisAt(i){
    const p=profile[i];
    const lat=roadLateralFrame(profile,i);
    return {
      p,
      nx:lat.x,
      nz:lat.z,
      lateralScale:lat.scale
    };
  }

  // Each row contains:
  // 0 left toe bottom
  // 1 left shoulder top
  // 2 left asphalt edge bottom
  // 3 left asphalt edge top
  // 4 right asphalt edge top
  // 5 right asphalt edge bottom
  // 6 right shoulder top
  // 7 right toe bottom
  for(let i=0;i<profile.length;i++){
    const {p,nx,nz,lateralScale}=basisAt(i);

    const roll=Number.isFinite(p.roll)
      ?p.roll
      :0;

    const rollSlope=Math.tan(roll);

    const push=(off,y)=>{
      edgePos.push(
        p.x-worldOffset.x+nx*off,
        p.y+y+rollSlope*(off*lateralScale),
        p.z-worldOffset.z+nz*off
      );
    };

    push( toeHalf,toeBottom);
    push( shoulderHalf,shoulderTop);
    push( asphaltHalf,slabBottom);
    push( asphaltHalf,asphaltTop);
    push(-asphaltHalf,asphaltTop);
    push(-asphaltHalf,slabBottom);
    push(-shoulderHalf,shoulderTop);
    push(-toeHalf,toeBottom);

    // Bottom slab vertices, kept separate for a darker underside material.
    underPos.push(
      p.x-worldOffset.x+nx*asphaltHalf,
      p.y+slabBottom+rollSlope*(asphaltHalf*lateralScale),
      p.z-worldOffset.z+nz*asphaltHalf,

      p.x-worldOffset.x-nx*asphaltHalf,
      p.y+slabBottom-rollSlope*(asphaltHalf*lateralScale),
      p.z-worldOffset.z-nz*asphaltHalf
    );
  }

  const row=8;

  for(let i=0;i<profile.length-1;i++){
    const a=i*row;
    const b=(i+1)*row;

    // Left outer embankment slope.
    edgeIdx.push(
      a+0,b+0,a+1,
      a+1,b+0,b+1
    );

    // Left shoulder underside/slope into asphalt slab.
    edgeIdx.push(
      a+1,b+1,a+2,
      a+2,b+1,b+2
    );

    // Visible left asphalt thickness.
    edgeIdx.push(
      a+2,b+2,a+3,
      a+3,b+2,b+3
    );

    // Visible right asphalt thickness.
    edgeIdx.push(
      a+4,b+4,a+5,
      a+5,b+4,b+5
    );

    // Right shoulder underside/slope.
    edgeIdx.push(
      a+5,b+5,a+6,
      a+6,b+5,b+6
    );

    // Right outer embankment slope.
    edgeIdx.push(
      a+6,b+6,a+7,
      a+7,b+6,b+7
    );

    // Dark underside of the central asphalt slab.
    const u=i*2;
    const v=(i+1)*2;

    underIdx.push(
      u,v,u+1,
      u+1,v,v+1
    );
  }

  const edgeGeom=new THREE.BufferGeometry();
  edgeGeom.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      edgePos,
      3
    )
  );
  edgeGeom.setIndex(edgeIdx);
  edgeGeom.computeVertexNormals();

  const edges=new THREE.Mesh(
    edgeGeom,
    roadEdgeMat
  );
  edges.castShadow=true;
  edges.receiveShadow=true;
  edges.renderOrder=1;
  group.add(edges);

  const underGeom=new THREE.BufferGeometry();
  underGeom.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      underPos,
      3
    )
  );
  underGeom.setIndex(underIdx);
  underGeom.computeVertexNormals();

  const underside=new THREE.Mesh(
    underGeom,
    roadUnderMat
  );
  underside.castShadow=true;
  underside.receiveShadow=true;
  underside.renderOrder=0;
  group.add(underside);

  return group;
}

function buildRoadProfile(){
  // V21.15.2 — build ONE CONTIGUOUS route window around the vehicle.
  //
  // The old spatial-radius filter could select two nearby hairpins while
  // skipping the route between them when that intermediate section left the
  // 1.05 km circle. buildRibbon() then joined those disconnected samples with
  // one giant triangle strip. Extreme switchback roads such as Yungas expose
  // this immediately. A cumulative-distance window stays contiguous by design.
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
    const steps=Math.max(1,Math.ceil(sampledLen/3)); // V21.21.27: <=3 m road samples for smoother pavement/marking ribbons

    for(let k=0;k<steps;k++){
      const u=k/steps;
      const t=t0+(t1-t0)*u;
      const x=seg.ax+(seg.bx-seg.ax)*t;
      const z=seg.az+(seg.bz-seg.az)*t;
      const cum=segStart+seg.len*t;
      if(!raw.length||Math.hypot(x-raw[raw.length-1].x,z-raw[raw.length-1].z)>.4){
        raw.push({x,z,y:terrainAbs(x,z),cum});
      }
    }

    lastIncluded={seg,t:t1};
  }
  if(!raw.length)return raw;

  // Add the exact clipped endpoint of the contiguous window.
  if(lastIncluded){
    const {seg,t}=lastIncluded;
    const x=seg.ax+(seg.bx-seg.ax)*t;
    const z=seg.az+(seg.bz-seg.az)*t;
    const cum=seg.cum+seg.len*t;
    if(Math.hypot(x-raw[raw.length-1].x,z-raw[raw.length-1].z)>.05){
      raw.push({x,z,y:terrainAbs(x,z),cum});
    }
  }

  // Two-pass weighted smoothing on HEIGHT ONLY.
  // Horizontal geometry remains the exact routing polyline, preserving every curve.
  let heights=raw.map(p=>p.y);
  for(let pass=0;pass<2;pass++){
    const h2=heights.slice();
    for(let i=2;i<heights.length-2;i++){
      h2[i]=(heights[i-2]+2*heights[i-1]+4*heights[i]+2*heights[i+1]+heights[i+2])/10;
    }
    heights=h2;
  }
  // Bridges override the terrain-following height AFTER normal road smoothing.
  // This is what prevents a road deck from dipping into the river/valley below.
  for(let i=0;i<raw.length;i++){
    const by=bridgeHeightAtCum(raw[i].cum);
    if(by!==null)heights[i]=by;
  }

  // Light pass at bridge approach boundaries only, retaining the deck itself.
  const finalH=heights.slice();
  for(let i=1;i<heights.length-1;i++){
    const here=bridgeHeightAtCum(raw[i].cum);
    if(here===null){
      const nearBridge=bridgeManager.isNearApproach(raw[i].cum,18);
      if(nearBridge)finalH[i]=(heights[i-1]+2*heights[i]+heights[i+1])/4;
    }
  }
  // V21.18 — guaranteed flat departure platform.
  //
  // Some routes begin on an extreme mountainside or immediately beside a stacked
  // switchback. Starting with the raw DEM profile can therefore put the car on a
  // severe pitch/roll before the player has even moved. Keep the first 28 m of
  // road perfectly level, then ease back to the untouched profile over the next
  // 72 m. Horizontal route geometry is never changed.
  const hasRouteStart=(raw[0]?.cum||0)<=1;
  const startPlatformY=finalH[0];
  const START_FLAT_LENGTH=28;
  const START_BLEND_LENGTH=72;
  const START_BLEND_END=START_FLAT_LENGTH+START_BLEND_LENGTH;

  function startProfileWeight(cum){
    // Once streaming has moved the contiguous profile window away from route
    // kilometre 0, this feature must become a complete no-op. Otherwise every
    // streaming window would accidentally acquire its own artificial flat start.
    if(!hasRouteStart)return 1;
    const d=Math.max(0,cum);
    if(d<=START_FLAT_LENGTH)return 0;
    if(d>=START_BLEND_END)return 1;
    const t=(d-START_FLAT_LENGTH)/START_BLEND_LENGTH;
    return t*t*(3-2*t);
  }

  const startSafeH=finalH.map((height,i)=>{
    const weight=startProfileWeight(raw[i].cum);
    return startPlatformY+(height-startPlatformY)*weight;
  });

  // Terrain-aligned road roll/camber.
  // Sample terrain across the road instead of keeping every cross-section horizontal.
  // A wider probe reduces sensitivity to tiny DEM noise.
  const rollProbe=5.6;
  const rawRoll=new Array(raw.length).fill(0);

  for(let i=0;i<raw.length;i++){
    const p=raw[i];
    const prev=raw[Math.max(0,i-1)];
    const next=raw[Math.min(raw.length-1,i+1)];

    let tx=next.x-prev.x;
    let tz=next.z-prev.z;
    const tl=Math.hypot(tx,tz)||1;

    tx/=tl;
    tz/=tl;

    const nx=-tz;
    const nz=tx;

    const leftY=terrainAbs(
      p.x+nx*rollProbe,
      p.z+nz*rollProbe
    );

    const rightY=terrainAbs(
      p.x-nx*rollProbe,
      p.z-nz*rollProbe
    );

    // Positive roll means the left edge is higher than the right edge.
    rawRoll[i]=Math.atan2(
      leftY-rightY,
      rollProbe*2
    );
  }

  // Three smoothing passes prevent visible twisting from DEM noise.
  let smoothedRoll=rawRoll;

  for(let pass=0;pass<3;pass++){
    const nextRoll=smoothedRoll.slice();

    for(let i=2;i<smoothedRoll.length-2;i++){
      nextRoll[i]=(
        smoothedRoll[i-2]+
        2*smoothedRoll[i-1]+
        4*smoothedRoll[i]+
        2*smoothedRoll[i+1]+
        smoothedRoll[i+2]
      )/10;
    }

    smoothedRoll=nextRoll;
  }

  // Roads normally follow the terrain cross-slope but should not inherit
  // extreme cliff angles. Cap at ~12 degrees.
  const maxRoadRoll=
    12*Math.PI/180;

  return raw.map((p,i)=>{
    const startWeight=startProfileWeight(p.cum);
    return {
      x:p.x,
      z:p.z,
      y:startSafeH[i],
      cum:p.cum,
      // The departure pad is truly flat crosswise too. Camber is restored with
      // the same smooth transition used for longitudinal height.
      roll:startWeight*Math.max(
        -maxRoadRoll,
        Math.min(
          maxRoadRoll,
          smoothedRoll[i]
        )
      )
    };
  });
}
const activeRoadProfile=[];

// V21.21.3 PERFORMANCE: spatial index for the local road profile.
// roadSurfaceAt() is called many times by wheel support, skid marks and the
// projected contact shadow. Previously each call scanned the whole ~2 km
// profile. The 48 m grid keeps the exact same nearest-segment result while
// limiting normal queries to nearby profile segments. Stacked switchbacks are
// still all evaluated because every segment sharing the neighboring cells is
// retained in the candidate set.
const ROAD_PROFILE_INDEX_CELL=48;
// Nested numeric maps avoid creating "cx:cz" strings in every wheel query.
let roadProfileSpatialIndex=new Map(); // Map<cx, Map<cz, number[]>>
let roadProfileVisitMarks=new Uint32Array(0);
let roadProfileVisitStamp=1;
const roadFrameSearchState={
  found:false,
  bd:Infinity,
  y:0,angle:0,pitch:0,roll:0,px:0,pz:0,index:0,t:0,distance:0
};

function roadProfileCellList(cx,cz,create=false){
  let column=roadProfileSpatialIndex.get(cx);
  if(!column){
    if(!create)return null;
    column=new Map();
    roadProfileSpatialIndex.set(cx,column);
  }
  let list=column.get(cz);
  if(!list&&create){
    list=[];
    column.set(cz,list);
  }
  return list||null;
}

function rebuildRoadProfileSpatialIndex(){
  roadProfileSpatialIndex.clear();
  const segmentCount=Math.max(0,activeRoadProfile.length-1);
  if(roadProfileVisitMarks.length<segmentCount){
    roadProfileVisitMarks=new Uint32Array(segmentCount);
  }else{
    roadProfileVisitMarks.fill(0,0,segmentCount);
  }
  roadProfileVisitStamp=1;

  for(let i=0;i<segmentCount;i++){
    const a=activeRoadProfile[i];
    const b=activeRoadProfile[i+1];
    const minX=Math.min(a.x,b.x),maxX=Math.max(a.x,b.x);
    const minZ=Math.min(a.z,b.z),maxZ=Math.max(a.z,b.z);
    const minCx=Math.floor(minX/ROAD_PROFILE_INDEX_CELL);
    const maxCx=Math.floor(maxX/ROAD_PROFILE_INDEX_CELL);
    const minCz=Math.floor(minZ/ROAD_PROFILE_INDEX_CELL);
    const maxCz=Math.floor(maxZ/ROAD_PROFILE_INDEX_CELL);
    for(let cx=minCx;cx<=maxCx;cx++){
      for(let cz=minCz;cz<=maxCz;cz++){
        roadProfileCellList(cx,cz,true).push(i);
      }
    }
  }
}

function setActiveRoadProfile(profile){
  activeRoadProfile.length=0;
  if(Array.isArray(profile))activeRoadProfile.push(...profile);
  rebuildRoadProfileSpatialIndex();
  return activeRoadProfile;
}

function clearActiveRoadProfile(){
  activeRoadProfile.length=0;
  roadProfileSpatialIndex.clear();
}

function collectRoadProfileCandidates(x,z,radius=20){
  const minCx=Math.floor((x-radius)/ROAD_PROFILE_INDEX_CELL);
  const maxCx=Math.floor((x+radius)/ROAD_PROFILE_INDEX_CELL);
  const minCz=Math.floor((z-radius)/ROAD_PROFILE_INDEX_CELL);
  const maxCz=Math.floor((z+radius)/ROAD_PROFILE_INDEX_CELL);
  const segmentCount=Math.max(0,activeRoadProfile.length-1);
  if(segmentCount<=0)return [];
  roadProfileVisitStamp=(roadProfileVisitStamp+1)>>>0;
  if(roadProfileVisitStamp===0){
    roadProfileVisitMarks.fill(0,0,segmentCount);
    roadProfileVisitStamp=1;
  }
  const stamp=roadProfileVisitStamp;
  const out=[];
  for(let cx=minCx;cx<=maxCx;cx++){
    for(let cz=minCz;cz<=maxCz;cz++){
      const list=roadProfileCellList(cx,cz,false);
      if(!list)continue;
      for(const i of list){
        if(i<0||i>=segmentCount||roadProfileVisitMarks[i]===stamp)continue;
        roadProfileVisitMarks[i]=stamp;
        out.push(i);
      }
    }
  }
  return out;
}

function roadFrameAt(x,z,searchRadius=22){
  if(activeRoadProfile.length<2)return null;
  const candidates=collectRoadProfileCandidates(x,z,searchRadius);
  let bd=Infinity,best=null;
  for(const i of candidates){
    const a=activeRoadProfile[i],b=activeRoadProfile[i+1];
    const vx=b.x-a.x,vz=b.z-a.z,wx=x-a.x,wz=z-a.z;
    const vv=vx*vx+vz*vz||1;
    const t=Math.max(0,Math.min(1,(wx*vx+wz*vz)/vv));
    const px=a.x+t*vx,pz=a.z+t*vz;
    const dx=x-px,dz=z-pz,d2=dx*dx+dz*dz;
    if(d2<bd){
      const y=a.y+(b.y-a.y)*t;
      const roll=(a.roll||0)+((b.roll||0)-(a.roll||0))*t;
      const len=Math.sqrt(vv)||1;
      const tx=vx/len,tz=vz/len;
      best={
        found:true,
        bd:d2,
        y,
        angle:Math.atan2(vx,vz),
        pitch:Math.atan2(b.y-a.y,len),
        roll,
        px,pz,
        index:i,t,
        distance:Math.sqrt(d2),
        tx,tz,
        nx:-tz,nz:tx
      };
      bd=d2;
    }
  }
  return best;
}

function roadProfileFrameAtCum(cum){
  if(activeRoadProfile.length<2)return null;
  const c=Math.max(activeRoadProfile[0].cum,Math.min(activeRoadProfile[activeRoadProfile.length-1].cum,cum));
  let lo=0,hi=activeRoadProfile.length-2;
  while(lo<=hi){
    const mid=(lo+hi)>>1;
    const a=activeRoadProfile[mid],b=activeRoadProfile[mid+1];
    if(c<a.cum)hi=mid-1;
    else if(c>b.cum)lo=mid+1;
    else{
      const span=Math.max(1e-6,b.cum-a.cum),t=(c-a.cum)/span;
      const vx=b.x-a.x,vz=b.z-a.z,len=Math.hypot(vx,vz)||1;
      return {
        y:a.y+(b.y-a.y)*t,
        angle:Math.atan2(vx,vz),
        pitch:Math.atan2(b.y-a.y,len),
        roll:(a.roll||0)+((b.roll||0)-(a.roll||0))*t,
        tx:vx/len,tz:vz/len,
        nx:-vz/len,nz:vx/len,
        index:mid,t,
        cum:c
      };
    }
  }
  return null;
}

function roadHeightAt(x,z){
  const frame=roadFrameAt(x,z,24);
  return frame?frame.y:null;
}

function roadSurfaceAt(x,z){
  const frame=roadFrameAt(x,z,26);
  if(!frame)return null;
  const lateral=(x-frame.px)*frame.nx+(z-frame.pz)*frame.nz;
  const crossY=frame.y+Math.tan(frame.roll||0)*lateral;
  return {...frame,y:crossY,lateral};
}

syncState();
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

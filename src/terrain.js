import {createTerrainService as createTerrainServiceP926} from './terrain-p926.js';

const P927_TRANSITION_BUDGET_MS=1.15;
const P927_TRANSITION_GAP_MS=8;
const P927_CELL_SIZE=48;
const PHOTO_OFF_NORMAL_EPS=7;

function nowMs(){return globalThis.performance?.now?.()??Date.now();}
function clamp01(v){return Math.max(0,Math.min(1,v));}
function lerp(a,b,t){return a+(b-a)*t;}
function terrainHillshade(nx,ny,nz){
  const directional=nx*-.58+ny*.64+nz*-.50;
  const slope=clamp01(1-Math.abs(ny));
  return Math.max(.34,Math.min(1.36,.72+directional*.46-slope*.10));
}
function scheduleTransitionSlice(callback){
  if(typeof globalThis.setTimeout==='function')globalThis.setTimeout(callback,P927_TRANSITION_GAP_MS);
  else callback();
}

function disposeObject(object){
  if(!object)return;
  object.parent?.remove?.(object);
  object.traverse?.(child=>{
    child.geometry?.dispose?.();
    const material=child.material;
    if(Array.isArray(material))material.forEach(item=>item?.dispose?.());
    else material?.dispose?.();
  });
}

function deepCloneTransition(object){
  if(!object?.clone)return null;
  const clone=object.clone(true);
  clone.traverse?.(child=>{
    if(child.geometry?.clone)child.geometry=child.geometry.clone();
    if(Array.isArray(child.material))child.material=child.material.map(item=>item?.clone?.()||item);
    else if(child.material?.clone)child.material=child.material.clone();
  });
  return clone;
}

function segmentUnitNormal(a,b){
  let tx=b.x-a.x,tz=b.z-a.z;
  const len=Math.hypot(tx,tz)||1;
  tx/=len;tz/=len;
  return {x:-tz,z:tx};
}

function profileOffsetVector(profile,index,lateralOffset){
  const point=profile[Math.max(0,Math.min(profile.length-1,index))];
  const prev=profile[Math.max(0,index-1)];
  const next=profile[Math.min(profile.length-1,index+1)];
  if(index<=0){const n=segmentUnitNormal(point,next);return{x:n.x*lateralOffset,z:n.z*lateralOffset};}
  if(index>=profile.length-1){const n=segmentUnitNormal(prev,point);return{x:n.x*lateralOffset,z:n.z*lateralOffset};}
  const n0=segmentUnitNormal(prev,point),n1=segmentUnitNormal(point,next);
  let mx=n0.x+n1.x,mz=n0.z+n1.z;
  const mlen=Math.hypot(mx,mz);
  if(mlen<.18)return{x:n1.x*lateralOffset,z:n1.z*lateralOffset};
  mx/=mlen;mz/=mlen;
  const denom=mx*n1.x+mz*n1.z;
  if(denom<.28)return{x:n1.x*lateralOffset,z:n1.z*lateralOffset};
  let length=lateralOffset/denom;
  const maxLength=Math.abs(lateralOffset)*1.45;
  length=Math.max(-maxLength,Math.min(maxLength,length));
  return{x:mx*length,z:mz*length};
}

function startPadHeight(options,x,z,naturalY){
  const pad=options?.startPad;
  if(!pad||!Number.isFinite(pad.x)||!Number.isFinite(pad.z)||!Number.isFinite(pad.y))return naturalY;
  const angle=Number.isFinite(pad.angle)?pad.angle:0;
  const forwardOffset=Number.isFinite(pad.forwardOffset)?pad.forwardOffset:0;
  const halfLength=Math.max(4,Number(pad.halfLength)||20);
  const halfWidth=Math.max(4,Number(pad.halfWidth)||10);
  const blendWidth=Math.max(2,Number(pad.blendWidth)||22);
  const tx=Math.sin(angle),tz=Math.cos(angle),nx=-tz,nz=tx;
  const cx=pad.x+tx*forwardOffset,cz=pad.z+tz*forwardOffset;
  const dx=x-cx,dz=z-cz;
  const along=dx*tx+dz*tz,lateral=dx*nx+dz*nz;
  const qx=Math.abs(along)-halfLength,qz=Math.abs(lateral)-halfWidth;
  const outside=Math.hypot(Math.max(0,qx),Math.max(0,qz));
  if(qx<=0&&qz<=0)return pad.y;
  if(outside>=blendWidth)return naturalY;
  const t=clamp01(outside/blendWidth),smooth=t*t*(3-2*t);
  return pad.y*(1-smooth)+naturalY*smooth;
}

export function createTerrainService(options={}){
  const originalGetWorldOffset=options.getWorldOffset;
  let forcedOffset=null;
  const getOffset=()=>forcedOffset||originalGetWorldOffset?.()||{x:0,z:0};
  const base=createTerrainServiceP926({...options,getWorldOffset:getOffset});
  const {THREE,ground,groundSize=2000}=options;
  if(!THREE||!ground||typeof originalGetWorldOffset!=='function')return base;

  let transitionProfile=[];
  let transitionOptions={roadHalfWidth:5.4,terrainCutHalfWidth:16.5,blendWidth:14,surfaceOffset:.20,startPad:null};
  let transitionSerial=0;
  let transitionPromise=null;
  let externalTransition=null;
  let heldTransition=null;
  let photoOffAppearanceRuns=0;
  let photoOffAppearanceAdjustedVertices=0;
  const perf={
    stateOnlyInstalls:0,
    transitionPreparations:0,
    transitionCommits:0,
    transitionDiscards:0,
    maxStateOnlyMs:0,
    maxSliceMs:0,
    maxCommitMs:0,
    last:null
  };

  function normalizeOptions(value={}){
    return {
      roadHalfWidth:Number(value.roadHalfWidth)||5.4,
      terrainCutHalfWidth:Number(value.terrainCutHalfWidth)||16.5,
      blendWidth:Number(value.blendWidth)||14,
      surfaceOffset:Number.isFinite(value.surfaceOffset)?value.surfaceOffset:.20,
      startPad:value.startPad&&typeof value.startPad==='object'?{...value.startPad}:null
    };
  }

  function normalizeRoadCutGroundAppearance(){
    const geometry=ground?.geometry;
    const position=geometry?.getAttribute?.('position');
    const normal=geometry?.getAttribute?.('normal');
    const color=geometry?.getAttribute?.('color');
    if(!position?.array||!normal?.array||!color?.array||typeof base.roadVisualHeightAt!=='function')return 0;

    const offset=originalGetWorldOffset?.()||{x:0,z:0};
    const p=position.array,n=normal.array,c=color.array;
    let adjusted=0;
    for(let i=0,j=0;i<position.count;i++,j+=3){
      const wx=(offset.x||0)+p[j],wz=(offset.z||0)+p[j+2];
      const visibleRoadHeight=base.roadVisualHeightAt(wx,wz);
      if(!Number.isFinite(visibleRoadHeight))continue;

      const oldNx=n[j],oldNy=n[j+1],oldNz=n[j+2];
      const oldShade=terrainHillshade(oldNx,oldNy,oldNz);
      const eps=PHOTO_OFF_NORMAL_EPS;
      const hL=base.heightAt(wx-eps,wz)-.15;
      const hR=base.heightAt(wx+eps,wz)-.15;
      const hD=base.heightAt(wx,wz-eps)-.15;
      const hU=base.heightAt(wx,wz+eps)-.15;
      const gx=(hR-hL)/(2*eps),gz=(hU-hD)/(2*eps);
      let nx=-gx,ny=1,nz=-gz;
      const inv=1/(Math.hypot(nx,ny,nz)||1);
      nx*=inv;ny*=inv;nz*=inv;
      const naturalShade=terrainHillshade(nx,ny,nz);
      const shadeRatio=naturalShade/Math.max(.34,oldShade);

      c[j]=clamp01(c[j]*shadeRatio);
      c[j+1]=clamp01(c[j+1]*shadeRatio);
      c[j+2]=clamp01(c[j+2]*shadeRatio);
      n[j]=nx;n[j+1]=ny;n[j+2]=nz;
      adjusted++;
    }
    if(adjusted){normal.needsUpdate=true;color.needsUpdate=true;}
    photoOffAppearanceRuns++;
    photoOffAppearanceAdjustedVertices=adjusted;
    return adjusted;
  }

  function transitionParent(){return ground.parent||null;}
  function findBaseTransition(){
    return transitionParent()?.children?.find?.(child=>
      child?.name==='road-terrain-transition'&&
      child!==externalTransition&&child!==heldTransition&&
      !child?.userData?.p927External
    )||null;
  }

  function preserveVisibleTransition(){
    if(externalTransition||heldTransition)return;
    const current=findBaseTransition();
    if(!current)return;
    heldTransition=deepCloneTransition(current);
    if(heldTransition){
      heldTransition.name='road-terrain-transition-p927-hold';
      heldTransition.userData={...(heldTransition.userData||{}),p927Hold:true};
    }
  }

  function restoreHeldTransition(){
    const parent=transitionParent();
    if(heldTransition&&parent&&!heldTransition.parent)parent.add(heldTransition);
  }

  function cancelRoadTransitionPreparation(){transitionSerial++;}

  function setRoadBedStateOnly(profile,value={}){
    cancelRoadTransitionPreparation();
    preserveVisibleTransition();
    transitionProfile=Array.isArray(profile)?profile.slice():[];
    transitionOptions=normalizeOptions(value);
    const real=originalGetWorldOffset()||{x:0,z:0};
    const started=nowMs();
    forcedOffset={x:(real.x||0)+10000000,z:(real.z||0)+10000000};
    let result;
    try{
      result=base.setRoadBed(transitionProfile,transitionOptions);
    }finally{
      forcedOffset=null;
      restoreHeldTransition();
    }
    const ms=nowMs()-started;
    perf.stateOnlyInstalls++;
    perf.maxStateOnlyMs=Math.max(perf.maxStateOnlyMs,ms);
    return result;
  }

  function clearExternalTransitions(){
    disposeObject(externalTransition);externalTransition=null;
    disposeObject(heldTransition);heldTransition=null;
  }

  function setRoadBed(profile,value={}){
    cancelRoadTransitionPreparation();
    clearExternalTransitions();
    transitionProfile=Array.isArray(profile)?profile.slice():[];
    transitionOptions=normalizeOptions(value);
    forcedOffset=null;
    const result=base.setRoadBed(transitionProfile,transitionOptions);
    normalizeRoadCutGroundAppearance();
    return result;
  }

  function rebuildGround(){
    const result=base.rebuildGround?.();
    normalizeRoadCutGroundAppearance();
    return result;
  }

  function buildRoadIndex(profile,opts){
    const map=new Map();
    const margin=Math.max(opts.roadHalfWidth,opts.terrainCutHalfWidth)+opts.blendWidth+4;
    const key=(cx,cz)=>`${cx},${cz}`;
    for(let i=0;i<profile.length-1;i++){
      const a=profile[i],b=profile[i+1];
      const vx=b.x-a.x,vz=b.z-a.z,len2=vx*vx+vz*vz;
      if(len2<1e-6)continue;
      const segment={ax:a.x,az:a.z,bx:b.x,bz:b.z,vx,vz,len2};
      const minCx=Math.floor((Math.min(a.x,b.x)-margin)/P927_CELL_SIZE);
      const maxCx=Math.floor((Math.max(a.x,b.x)+margin)/P927_CELL_SIZE);
      const minCz=Math.floor((Math.min(a.z,b.z)-margin)/P927_CELL_SIZE);
      const maxCz=Math.floor((Math.max(a.z,b.z)+margin)/P927_CELL_SIZE);
      for(let cx=minCx;cx<=maxCx;cx++)for(let cz=minCz;cz<=maxCz;cz++){
        const k=key(cx,cz);let bucket=map.get(k);if(!bucket){bucket=[];map.set(k,bucket);}bucket.push(segment);
      }
    }
    return {map,key};
  }

  function prepareRoadTransitionIncremental(){
    const serial=++transitionSerial;
    const wallStarted=nowMs();
    perf.transitionPreparations++;
    const profile=transitionProfile.slice();
    const opts={...transitionOptions,startPad:transitionOptions.startPad?{...transitionOptions.startPad}:null};
    const offset={...(originalGetWorldOffset()||{x:0,z:0})};
    if(profile.length<2)return Promise.resolve(null);

    const roadIndex=buildRoadIndex(profile,opts);
    const protectedRadius=Math.max(5.05,opts.roadHalfWidth-.28);
    const protected2=protectedRadius*protectedRadius;
    const nearestDistance2=(x,z)=>{
      const bucket=roadIndex.map.get(roadIndex.key(Math.floor(x/P927_CELL_SIZE),Math.floor(z/P927_CELL_SIZE)));
      if(!bucket?.length)return Infinity;
      let best=Infinity;
      for(const segment of bucket){
        let t=((x-segment.ax)*segment.vx+(z-segment.az)*segment.vz)/segment.len2;
        t=Math.max(0,Math.min(1,t));
        const dx=x-(segment.ax+segment.vx*t),dz=z-(segment.az+segment.vz*t);
        const d2=dx*dx+dz*dz;if(d2<best)best=d2;
      }
      return best;
    };

    const visualInner=Math.max(opts.roadHalfWidth-.15,5.20);
    const visualOuter=Math.max(visualInner+1,opts.terrainCutHalfWidth+opts.blendWidth);
    const fractions=[0,.12,.28,.50,.74,1];
    const lateralMagnitudes=fractions.map(f=>visualInner+(visualOuter-visualInner)*f);
    const cols=lateralMagnitudes.length;
    const half=groundSize/2+80;
    const usable=[];
    for(let i=0;i<profile.length;i++){
      const p=profile[i],lx=p.x-offset.x,lz=p.z-offset.z;
      if(lx<-half||lx>half||lz<-half||lz>half)continue;
      usable.push({point:p,sourceIndex:i});
    }
    if(usable.length<2)return Promise.resolve(null);

    const sideVertexCount=usable.length*cols;
    const sides=[-1,1].map(side=>({
      side,
      positions:new Float32Array(sideVertexCount*3),
      uvs:new Float32Array(sideVertexCount*2),
      rawHeights:new Float32Array(sideVertexCount),
      normals:new Float32Array(sideVertexCount*3),
      colors:new Float32Array(sideVertexCount*3),
      indices:[],
      singleClear:new Uint8Array(sideVertexCount),
      pairClear:new Map()
    }));
    const stats={setupMs:nowMs()-wallStarted,vertexCpuMs:0,indexCpuMs:0,normalCpuMs:0,colorCpuMs:0,slices:0,maxSliceMs:0};
    const recordSlice=started=>{
      const elapsed=nowMs()-started;stats.slices++;stats.maxSliceMs=Math.max(stats.maxSliceMs,elapsed);perf.maxSliceMs=Math.max(perf.maxSliceMs,elapsed);return elapsed;
    };
    const runSliced=(count,minBatch,fn,cpuKey)=>new Promise(resolve=>{
      let index=0;
      const step=()=>{
        if(serial!==transitionSerial){resolve(false);return;}
        const started=nowMs();let processed=0;
        while(index<count){fn(index++);processed++;if(processed>=minBatch&&nowMs()-started>=P927_TRANSITION_BUDGET_MS)break;}
        stats[cpuKey]+=recordSlice(started);
        if(index<count){scheduleTransitionSlice(step);return;}resolve(true);
      };
      scheduleTransitionSlice(step);
    });

    const buildVertices=()=>runSliced(sideVertexCount*2,24,globalIndex=>{
      const sideIndex=globalIndex>=sideVertexCount?1:0;
      const localIndex=globalIndex-sideIndex*sideVertexCount;
      const data=sides[sideIndex],row=Math.floor(localIndex/cols),col=localIndex-row*cols;
      const {point,sourceIndex}=usable[row];
      const magnitude=lateralMagnitudes[col],lateralOffset=magnitude*data.side;
      const shift=profileOffsetVector(profile,sourceIndex,lateralOffset);
      const wx=point.x+shift.x,wz=point.z+shift.z;
      const rawNatural=base.heightAt(wx,wz);
      const natural=startPadHeight(opts,wx,wz,rawNatural);
      const roadY=Number.isFinite(point.y)?point.y:base.heightAt(point.x,point.z);
      const rollSlope=Math.tan(Number.isFinite(point.roll)?point.roll:0);
      const support=roadY+rollSlope*lateralOffset-opts.surfaceOffset;
      const t=(magnitude-visualInner)/Math.max(.001,visualOuter-visualInner);
      const rise=1-Math.pow(1-clamp01(t),2.35);
      const j=localIndex*3,u=localIndex*2;
      data.positions[j]=wx-offset.x;data.positions[j+1]=Math.min(natural,support*(1-rise)+natural*rise);data.positions[j+2]=wz-offset.z;
      data.uvs[u]=(wx-offset.x+groundSize/2)/groundSize;data.uvs[u+1]=1-(wz-offset.z+groundSize/2)/groundSize;
      data.rawHeights[localIndex]=rawNatural;
    },'vertexCpuMs');

    function clearFunctions(data){
      const pointClear1=i=>{
        const cached=data.singleClear[i];if(cached)return cached===2;
        const j=i*3,ok=nearestDistance2(data.positions[j]+offset.x,data.positions[j+2]+offset.z)>protected2;
        data.singleClear[i]=ok?2:1;return ok;
      };
      const pointClear2=(a,b)=>{
        const lo=Math.min(a,b),hi=Math.max(a,b),key=lo*sideVertexCount+hi;
        if(data.pairClear.has(key))return data.pairClear.get(key);
        const ax=data.positions[a*3],az=data.positions[a*3+2],bx=data.positions[b*3],bz=data.positions[b*3+2];
        const ok=nearestDistance2((ax+bx)/2+offset.x,(az+bz)/2+offset.z)>protected2;data.pairClear.set(key,ok);return ok;
      };
      const pointClear3=(a,b,c)=>{
        const x=(data.positions[a*3]+data.positions[b*3]+data.positions[c*3])/3+offset.x;
        const z=(data.positions[a*3+2]+data.positions[b*3+2]+data.positions[c*3+2])/3+offset.z;
        return nearestDistance2(x,z)>protected2;
      };
      return (a,b,c)=>pointClear1(a)&&pointClear1(b)&&pointClear1(c)&&pointClear2(a,b)&&pointClear2(b,c)&&pointClear2(c,a)&&pointClear3(a,b,c);
    }

    const cellCount=Math.max(0,(usable.length-1)*(cols-1));
    const buildIndices=()=>runSliced(cellCount*2,5,globalCell=>{
      const sideIndex=globalCell>=cellCount?1:0,cell=globalCell-sideIndex*cellCount;
      const data=sides[sideIndex],row=Math.floor(cell/(cols-1)),col=cell-row*(cols-1);
      if(usable[row+1].sourceIndex!==usable[row].sourceIndex+1)return;
      const p0=usable[row].point,p1=usable[row+1].point;
      const centerStep=Math.hypot(p1.x-p0.x,p1.z-p0.z);if(centerStep>9)return;
      const a=row*cols+col,b=a+1,c=a+cols,d=c+1;
      const p=data.positions;
      const maxEdge=Math.max(
        Math.hypot(p[c*3]-p[a*3],p[c*3+2]-p[a*3+2]),
        Math.hypot(p[d*3]-p[b*3],p[d*3+2]-p[b*3+2]),
        Math.hypot(p[b*3]-p[a*3],p[b*3+2]-p[a*3+2]),
        Math.hypot(p[d*3]-p[c*3],p[d*3+2]-p[c*3+2])
      );
      const expected=Math.max(10,centerStep*3,(lateralMagnitudes[col+1]-lateralMagnitudes[col])*3);if(maxEdge>expected)return;
      if(!data._triangleClear)data._triangleClear=clearFunctions(data);
      if(data._triangleClear(a,c,b))data.indices.push(a,c,b);
      if(data._triangleClear(b,c,d))data.indices.push(b,c,d);
    },'indexCpuMs');

    const groundPosition=ground.geometry?.getAttribute?.('position')?.array;
    let rangeMin=Infinity,rangeMax=-Infinity;
    const scanGroundRange=()=>{
      if(!groundPosition)return Promise.resolve(true);
      const count=Math.floor(groundPosition.length/3);
      return runSliced(count,512,i=>{const y=groundPosition[i*3+1];if(y<rangeMin)rangeMin=y;if(y>rangeMax)rangeMax=y;},'colorCpuMs');
    };

    const buildColors=()=>{
      if(!Number.isFinite(rangeMin)||!Number.isFinite(rangeMax)||rangeMax<=rangeMin){rangeMin=0;rangeMax=1;}
      const span=Math.max(1,rangeMax-rangeMin),eps=7;
      const low=[0x4f/255,0x6e/255,0x3e/255],mid=[0x6f/255,0x81/255,0x50/255],high=[0x8b/255,0x8d/255,0x69/255];
      const lightX=-.58,lightY=.64,lightZ=-.50;
      return runSliced(sideVertexCount*2,16,globalIndex=>{
        const sideIndex=globalIndex>=sideVertexCount?1:0,i=globalIndex-sideIndex*sideVertexCount,data=sides[sideIndex],j=i*3;
        const wx=data.positions[j]+offset.x,wz=data.positions[j+2]+offset.z;
        const y=data.rawHeights[i]-.15;
        const hL=base.heightAt(wx-eps,wz)-.15,hR=base.heightAt(wx+eps,wz)-.15,hD=base.heightAt(wx,wz-eps)-.15,hU=base.heightAt(wx,wz+eps)-.15;
        const gx=(hR-hL)/(2*eps),gz=(hU-hD)/(2*eps);let nx=-gx,ny=1,nz=-gz;const inv=1/(Math.hypot(nx,ny,nz)||1);nx*=inv;ny*=inv;nz*=inv;
        // Terrain R1: the refined road earthwork replaces natural ground geometry,
        // but its lighting must retain the natural DEM normal so the helper mesh
        // cannot reveal itself as a bright band across steep hillsides.
        data.normals[j]=nx;data.normals[j+1]=ny;data.normals[j+2]=nz;
        const directional=nx*lightX+ny*lightY+nz*lightZ,slope=clamp01(1-Math.abs(ny)),altitude=clamp01((y-rangeMin)/span);
        let r,g,b;if(altitude<.58){const t=altitude/.58;r=lerp(low[0],mid[0],t);g=lerp(low[1],mid[1],t);b=lerp(low[2],mid[2],t);}else{const t=(altitude-.58)/.42;r=lerp(mid[0],high[0],t);g=lerp(mid[1],high[1],t);b=lerp(mid[2],high[2],t);}
        const shade=Math.max(.34,Math.min(1.36,.72+directional*.46-slope*.10));data.colors[j]=Math.min(1,r*shade);data.colors[j+1]=Math.min(1,g*shade);data.colors[j+2]=Math.min(1,b*shade);
      },'colorCpuMs');
    };

    const promise=(async()=>{
      if(!await buildVertices())return null;
      if(!await buildIndices())return null;
      if(!await scanGroundRange())return null;
      if(!await buildColors())return null;
      if(serial!==transitionSerial)return null;
      const group=new THREE.Group();group.name='road-terrain-transition';group.userData.p927External=true;
      let triangles=0;
      for(const data of sides){
        if(!data.indices.length)continue;
        triangles+=data.indices.length/3;
        const geometry=new THREE.BufferGeometry();
        geometry.setAttribute('position',new THREE.BufferAttribute(data.positions,3));
        geometry.setAttribute('uv',new THREE.BufferAttribute(data.uvs,2));
        geometry.setAttribute('normal',new THREE.BufferAttribute(data.normals,3));
        geometry.setAttribute('color',new THREE.BufferAttribute(data.colors,3));
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(data.indices),1));
        const material=ground.material.clone();material.map=null;material.alphaMap=null;material.alphaTest=0;material.transparent=false;material.side=THREE.DoubleSide;material.polygonOffset=true;material.polygonOffsetFactor=1;material.polygonOffsetUnits=1;
        const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;mesh.castShadow=false;mesh.renderOrder=-1;group.add(mesh);
      }
      const meta={serial,preparedOffset:{...offset},profilePoints:profile.length,usablePoints:usable.length,vertices:sideVertexCount*2,triangles,prepareWallMs:nowMs()-wallStarted,prepareCpuMs:stats.vertexCpuMs+stats.indexCpuMs+stats.normalCpuMs+stats.colorCpuMs,slices:stats.slices,maxSliceMs:stats.maxSliceMs,p927SliceBudgetMs:P927_TRANSITION_BUDGET_MS,p927SliceGapMs:P927_TRANSITION_GAP_MS};
      perf.last=meta;
      return {serial,offset,group,meta};
    })();
    transitionPromise=promise;
    return promise.finally(()=>{if(transitionPromise===promise)transitionPromise=null;});
  }

  function commitPreparedRoadTransition(prepared){
    if(!prepared||prepared.serial!==transitionSerial){perf.transitionDiscards++;disposeObject(prepared?.group);return false;}
    const current=originalGetWorldOffset()||{x:0,z:0};
    if(Math.hypot((current.x||0)-prepared.offset.x,(current.z||0)-prepared.offset.z)>.5){perf.transitionDiscards++;disposeObject(prepared.group);return false;}
    const started=nowMs();
    disposeObject(externalTransition);externalTransition=null;
    disposeObject(heldTransition);heldTransition=null;
    for(const child of [...(transitionParent()?.children||[])]){
      if(child?.name==='road-terrain-transition'&&!child?.userData?.p927External)disposeObject(child);
    }
    transitionParent()?.add?.(prepared.group);externalTransition=prepared.group;
    externalTransition.position.set(0,0,0);externalTransition.updateMatrix?.();
    const ms=nowMs()-started;perf.transitionCommits++;perf.maxCommitMs=Math.max(perf.maxCommitMs,ms);perf.last={...(prepared.meta||{}),commitMs:ms};return true;
  }

  async function rebuildRoadTransitionIncremental(){
    const prepared=await prepareRoadTransitionIncremental();
    if(!prepared)return false;
    return commitPreparedRoadTransition(prepared);
  }

  function shiftRoadBedOrigin(shiftX,shiftZ){
    base.shiftRoadBedOrigin?.(shiftX,shiftZ);
    for(const group of [externalTransition,heldTransition])if(group){group.position.x-=shiftX;group.position.z-=shiftZ;group.updateMatrix?.();}
  }
  function resetRoadBedOrigin(){
    base.resetRoadBedOrigin?.();
    for(const group of [externalTransition,heldTransition])if(group){group.position.set(0,0,0);group.updateMatrix?.();}
  }
  function clearRoadBed(){
    cancelRoadTransitionPreparation();clearExternalTransitions();transitionProfile=[];return base.clearRoadBed?.();
  }
  function p927Diagnostics(){
    return {enabled:true,pending:!!transitionPromise,stateOnlyInstalls:perf.stateOnlyInstalls,transitionPreparations:perf.transitionPreparations,transitionCommits:perf.transitionCommits,transitionDiscards:perf.transitionDiscards,maxStateOnlyMs:Number(perf.maxStateOnlyMs.toFixed(3)),maxSliceMs:Number(perf.maxSliceMs.toFixed(3)),maxCommitMs:Number(perf.maxCommitMs.toFixed(3)),p927SliceBudgetMs:P927_TRANSITION_BUDGET_MS,p927SliceGapMs:P927_TRANSITION_GAP_MS,photoOffAppearanceRuns,photoOffAppearanceAdjustedVertices,last:perf.last};
  }
  function diagnostics(){return {...(base.diagnostics?.()||{}),p927:p927Diagnostics()};}

  return {...base,rebuildGround,setRoadBed,setRoadBedStateOnly,prepareRoadTransitionIncremental,commitPreparedRoadTransition,rebuildRoadTransitionIncremental,cancelRoadTransitionPreparation,shiftRoadBedOrigin,resetRoadBedOrigin,clearRoadBed,p927Diagnostics,diagnostics};
}

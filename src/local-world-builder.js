const P922_GRID_NORMALS_FLAG='__worldDriveP922GridNormals';

function installFastGroundGridNormals(THREE){
  const proto=THREE?.BufferGeometry?.prototype;
  if(!proto||proto[P922_GRID_NORMALS_FLAG])return false;
  const original=proto.computeVertexNormals;
  if(typeof original!=='function')return false;

  proto[P922_GRID_NORMALS_FLAG]=original;
  proto.computeVertexNormals=function(...args){
    const segments=Number(this.userData?.worldDriveGroundSegments);
    const positions=this.getAttribute?.('position');
    const grid=segments+1;

    if(
      Number.isInteger(segments)&&segments>1&&
      positions?.itemSize===3&&
      positions.count===grid*grid&&
      positions.array
    ){
      let normals=this.getAttribute?.('normal');
      if(
        !normals||normals.itemSize!==3||
        normals.count!==positions.count||
        normals.array?.length!==positions.array.length
      ){
        normals=new THREE.BufferAttribute(
          new Float32Array(positions.array.length),3
        );
        this.setAttribute('normal',normals);
      }

      const p=positions.array;
      const n=normals.array;
      for(let row=0;row<grid;row++){
        const upRow=Math.max(0,row-1);
        const downRow=Math.min(segments,row+1);
        for(let col=0;col<grid;col++){
          const leftCol=Math.max(0,col-1);
          const rightCol=Math.min(segments,col+1);
          const index=row*grid+col;
          const left=(row*grid+leftCol)*3;
          const right=(row*grid+rightCol)*3;
          const up=(upRow*grid+col)*3;
          const down=(downRow*grid+col)*3;
          const out=index*3;
          const dx=p[right]-p[left];
          const dz=p[down+2]-p[up+2];
          let nx=dx?(p[left+1]-p[right+1])/dx:0;
          let ny=1;
          let nz=dz?(p[up+1]-p[down+1])/dz:0;
          const inv=1/(Math.hypot(nx,ny,nz)||1);
          n[out]=nx*inv;
          n[out+1]=ny*inv;
          n[out+2]=nz*inv;
        }
      }
      normals.needsUpdate=true;
      return;
    }
    return original.apply(this,args);
  };
  return true;
}

function terrainTransitionProfile(profile){
  if(!Array.isArray(profile)||profile.length<4)return profile||[];
  const MAX_STEP=8.25;
  const TURN_SINE_KEEP=.032;
  const GRADE_DELTA_KEEP=.012;
  const ROLL_DELTA_KEEP=.0045;
  const result=[profile[0]];
  let lastKept=profile[0];

  for(let i=1;i<profile.length-1;i++){
    const prev=profile[i-1];
    const cur=profile[i];
    const next=profile[i+1];
    const spanToNext=Math.hypot(next.x-lastKept.x,next.z-lastKept.z);
    const v0x=cur.x-prev.x,v0z=cur.z-prev.z;
    const v1x=next.x-cur.x,v1z=next.z-cur.z;
    const len0=Math.hypot(v0x,v0z)||1;
    const len1=Math.hypot(v1x,v1z)||1;
    const turnSine=Math.abs(v0x*v1z-v0z*v1x)/(len0*len1);
    const grade0=Number.isFinite(cur.y)&&Number.isFinite(prev.y)
      ?(cur.y-prev.y)/len0:0;
    const grade1=Number.isFinite(next.y)&&Number.isFinite(cur.y)
      ?(next.y-cur.y)/len1:grade0;
    const prevRoll=Number(prev.roll)||0;
    const curRoll=Number(cur.roll)||0;
    const nextRoll=Number(next.roll)||0;
    const rollDelta=Math.max(
      Math.abs(curRoll-prevRoll),
      Math.abs(nextRoll-curRoll)
    );

    if(
      spanToNext>MAX_STEP||
      turnSine>TURN_SINE_KEEP||
      Math.abs(grade1-grade0)>GRADE_DELTA_KEEP||
      rollDelta>ROLL_DELTA_KEEP
    ){
      result.push(cur);
      lastKept=cur;
    }
  }
  result.push(profile[profile.length-1]);
  return result;
}

function roadBedOptionsForProfile(profile){
  return {
    roadHalfWidth:5.4,
    terrainCutHalfWidth:16.5,
    blendWidth:14.0,
    surfaceOffset:0.20,
    startPad:profile.length>1&&(profile[0].cum||0)<=1?{
      x:profile[0].x,
      z:profile[0].z,
      y:profile[0].y-0.20,
      angle:Math.atan2(
        profile[1].x-profile[0].x,
        profile[1].z-profile[0].z
      ),
      forwardOffset:7,
      halfLength:20,
      halfWidth:10,
      blendWidth:22
    }:null
  };
}

function makeBypassGroundGeometry(realGeometry){
  const segments=Number(realGeometry?.userData?.worldDriveGroundSegments);
  const size=Number(realGeometry?.userData?.worldDriveGroundSize);
  if(!Number.isInteger(segments)||segments<2||!Number.isFinite(size))return null;

  const expected=(segments+1)*(segments+1);
  const sampleSide=5;
  const sampleCount=sampleSide*sampleSide;
  const array=new Float32Array(sampleCount*3);
  const normalArray=new Float32Array(sampleCount*3);
  let cursor=0;
  for(let row=0;row<sampleSide;row++){
    const z=-size/2+size*row/(sampleSide-1);
    for(let col=0;col<sampleSide;col++){
      const x=-size/2+size*col/(sampleSide-1);
      array[cursor]=x;
      array[cursor+1]=0;
      array[cursor+2]=z;
      normalArray[cursor+1]=1;
      cursor+=3;
    }
  }

  let countReads=0;
  const position={
    itemSize:3,
    array,
    get count(){return countReads++===0?expected:sampleCount;},
    needsUpdate:false
  };
  const normal={
    itemSize:3,
    array:normalArray,
    count:sampleCount,
    needsUpdate:false
  };
  const attributes={position,normal};

  return {
    userData:{
      worldDriveGroundSegments:segments,
      worldDriveGroundSize:size
    },
    attributes,
    getAttribute(name){return attributes[name];},
    setAttribute(name,value){attributes[name]=value;return this;},
    computeVertexNormals(){},
    dispose(){}
  };
}

function schedulePreparationSlice(callback){
  if(typeof globalThis.requestIdleCallback==='function'){
    globalThis.requestIdleCallback(callback,{timeout:55});
  }else{
    setTimeout(()=>callback({didTimeout:true,timeRemaining:()=>0}),0);
  }
}

export function createLocalWorldBuilder({
  THREE,
  resetStreamedWorldOrigins,
  terrainService,
  ground,
  clearGroup,
  roadGroup,
  forestGroup,
  infrastructureGroup,
  signGroup,
  sceneryRenderer,
  getBridgeFeatureCount,
  rebuildBridgeSpans,
  buildRoadProfile,
  setActiveRoadProfile,
  buildRoadVolume,
  buildLateralBand,
  buildRibbon,
  buildOffsetRibbon,
  shoulderMat,
  roadMat,
  lineYellow,
  lineWhite,
  ROAD_SURFACE_OFFSET,
  getWorldOffset,
  rebuildLocalWater,
  scheduleVisualJob,
  rebuildLocalScenery,
  addEnhancedBridgeFurniture,
  refreshRoadSignsOnly,
  freezeStaticMatrices,
  rebuildHorizon,
  markStaticShadowsDirty,
}){
  const now=()=>globalThis.performance?.now?.()??Date.now();
  installFastGroundGridNormals(THREE);

  // main.js historically did not pass the near-ground mesh to this builder.
  // P9.23 can find it safely: roadGroup -> world -> scene, where the near DEM
  // mesh is the unique vertex-coloured renderOrder -5 mesh.
  ground=ground||roadGroup?.parent?.parent?.children?.find?.(child=>
    child?.isMesh&&child?.renderOrder===-5&&
    child?.material?.vertexColors===true&&
    child?.geometry?.attributes?.position
  )||null;

  let prepareSerial=0;
  const p923Perf={
    preparations:0,
    preparedCommits:0,
    discarded:0,
    maxSliceMs:0,
    last:null,
    maxRoadStateInstallMs:0,
    maxGroundCommitMs:0
  };

  function installTerrainRoadStateFast(terrainProfile,options){
    if(!ground?.geometry)return {ok:false,ms:0,bypassed:false};
    const realGeometry=ground.geometry;
    const bypass=makeBypassGroundGeometry(realGeometry);
    if(!bypass){
      const started=now();
      terrainService.setRoadBed(terrainProfile,options);
      return {ok:true,ms:now()-started,bypassed:false};
    }

    const px=ground.position?.x||0;
    const py=ground.position?.y||0;
    const pz=ground.position?.z||0;
    const rx=ground.rotation?.x||0;
    const ry=ground.rotation?.y||0;
    const rz=ground.rotation?.z||0;
    const started=now();
    ground.geometry=bypass;
    try{
      terrainService.setRoadBed(terrainProfile,options);
    }finally{
      ground.geometry=realGeometry;
      ground.position?.set?.(px,py,pz);
      ground.rotation?.set?.(rx,ry,rz);
      ground.updateMatrix?.();
    }
    return {ok:true,ms:now()-started,bypassed:true};
  }

  function prepareGroundBuffers(serial,offset){
    const geometry=ground?.geometry;
    const positions=geometry?.getAttribute?.('position');
    const segments=Number(geometry?.userData?.worldDriveGroundSegments);
    const grid=segments+1;
    if(
      !geometry||!positions?.array||
      !Number.isInteger(segments)||segments<2||
      positions.count!==grid*grid
    ){
      return Promise.resolve(null);
    }

    const count=positions.count;
    const source=positions.array;
    const heights=new Float32Array(count);
    const normals=new Float32Array(count*3);
    const colors=new Float32Array(count*3);
    const stats={
      heightCpuMs:0,
      normalCpuMs:0,
      colorCpuMs:0,
      slices:0,
      maxSliceMs:0,
      minY:Infinity,
      maxY:-Infinity,
      vertices:count
    };
    const BUDGET_MS=3.0;

    function runHeight(){
      return new Promise(resolve=>{
        let index=0;
        const step=deadline=>{
          if(serial!==prepareSerial){resolve(null);return;}
          const started=now();
          let processed=0;
          while(index<count){
            const j=index*3;
            const y=terrainService.renderHeightAt(
              offset.x+source[j],
              offset.z+source[j+2]
            );
            heights[index]=y;
            if(y<stats.minY)stats.minY=y;
            if(y>stats.maxY)stats.maxY=y;
            index++;processed++;
            if(
              processed>=96&&
              (now()-started>=BUDGET_MS||(!deadline.didTimeout&&deadline.timeRemaining()<.8))
            )break;
          }
          const elapsed=now()-started;
          stats.heightCpuMs+=elapsed;
          stats.slices++;
          stats.maxSliceMs=Math.max(stats.maxSliceMs,elapsed);
          p923Perf.maxSliceMs=Math.max(p923Perf.maxSliceMs,elapsed);
          if(index<count){schedulePreparationSlice(step);return;}
          resolve(true);
        };
        schedulePreparationSlice(step);
      });
    }

    function runNormals(){
      return new Promise(resolve=>{
        let row=0;
        const step=deadline=>{
          if(serial!==prepareSerial){resolve(null);return;}
          const started=now();
          let rows=0;
          while(row<grid){
            const upRow=Math.max(0,row-1);
            const downRow=Math.min(segments,row+1);
            for(let col=0;col<grid;col++){
              const leftCol=Math.max(0,col-1);
              const rightCol=Math.min(segments,col+1);
              const index=row*grid+col;
              const leftIndex=row*grid+leftCol;
              const rightIndex=row*grid+rightCol;
              const upIndex=upRow*grid+col;
              const downIndex=downRow*grid+col;
              const left=leftIndex*3;
              const right=rightIndex*3;
              const up=upIndex*3;
              const down=downIndex*3;
              const out=index*3;
              const dx=source[right]-source[left];
              const dz=source[down+2]-source[up+2];
              let nx=dx?(heights[leftIndex]-heights[rightIndex])/dx:0;
              let ny=1;
              let nz=dz?(heights[upIndex]-heights[downIndex])/dz:0;
              const inv=1/(Math.hypot(nx,ny,nz)||1);
              normals[out]=nx*inv;
              normals[out+1]=ny*inv;
              normals[out+2]=nz*inv;
            }
            row++;rows++;
            if(
              rows>=1&&
              (now()-started>=BUDGET_MS||(!deadline.didTimeout&&deadline.timeRemaining()<.8))
            )break;
          }
          const elapsed=now()-started;
          stats.normalCpuMs+=elapsed;
          stats.slices++;
          stats.maxSliceMs=Math.max(stats.maxSliceMs,elapsed);
          p923Perf.maxSliceMs=Math.max(p923Perf.maxSliceMs,elapsed);
          if(row<grid){schedulePreparationSlice(step);return;}
          resolve(true);
        };
        schedulePreparationSlice(step);
      });
    }

    function runColors(){
      return new Promise(resolve=>{
        let index=0;
        const minY=Number.isFinite(stats.minY)?stats.minY:0;
        const maxY=Number.isFinite(stats.maxY)?stats.maxY:minY+1;
        const heightSpan=Math.max(1,maxY-minY);
        const low=[79/255,110/255,62/255];
        const mid=[111/255,129/255,80/255];
        const high=[139/255,141/255,105/255];
        const lightX=-.58,lightY=.64,lightZ=-.50;
        const step=deadline=>{
          if(serial!==prepareSerial){resolve(null);return;}
          const started=now();
          let processed=0;
          while(index<count){
            const j=index*3;
            const nx=normals[j],ny=normals[j+1],nz=normals[j+2];
            const altitude=Math.max(0,Math.min(1,(heights[index]-minY)/heightSpan));
            let r,g,b;
            if(altitude<.58){
              const t=altitude/.58;
              r=low[0]+(mid[0]-low[0])*t;
              g=low[1]+(mid[1]-low[1])*t;
              b=low[2]+(mid[2]-low[2])*t;
            }else{
              const t=(altitude-.58)/.42;
              r=mid[0]+(high[0]-mid[0])*t;
              g=mid[1]+(high[1]-mid[1])*t;
              b=mid[2]+(high[2]-mid[2])*t;
            }
            const directional=nx*lightX+ny*lightY+nz*lightZ;
            const slope=Math.max(0,Math.min(1,1-Math.abs(ny)));
            const shade=Math.max(.34,Math.min(1.36,.72+directional*.46-slope*.10));
            colors[j]=Math.min(1,r*shade);
            colors[j+1]=Math.min(1,g*shade);
            colors[j+2]=Math.min(1,b*shade);
            index++;processed++;
            if(
              processed>=192&&
              (now()-started>=BUDGET_MS||(!deadline.didTimeout&&deadline.timeRemaining()<.8))
            )break;
          }
          const elapsed=now()-started;
          stats.colorCpuMs+=elapsed;
          stats.slices++;
          stats.maxSliceMs=Math.max(stats.maxSliceMs,elapsed);
          p923Perf.maxSliceMs=Math.max(p923Perf.maxSliceMs,elapsed);
          if(index<count){schedulePreparationSlice(step);return;}
          resolve(true);
        };
        schedulePreparationSlice(step);
      });
    }

    return (async()=>{
      if(!await runHeight())return null;
      if(!await runNormals())return null;
      if(!await runColors())return null;
      return {geometry,positions,heights,normals,colors,segments,offset:{...offset},stats};
    })();
  }

  function commitGroundBuffers(prepared){
    if(!prepared||ground?.geometry!==prepared.geometry)return {ok:false,ms:0};
    const started=now();
    const geometry=prepared.geometry;
    const position=geometry.getAttribute('position');
    const p=position.array;
    for(let i=0,j=0;i<prepared.heights.length;i++,j+=3)p[j+1]=prepared.heights[i];
    position.needsUpdate=true;

    let normal=geometry.getAttribute('normal');
    if(!normal||normal.array?.length!==prepared.normals.length){
      normal=new THREE.BufferAttribute(new Float32Array(prepared.normals.length),3);
      geometry.setAttribute('normal',normal);
    }
    normal.array.set(prepared.normals);
    normal.needsUpdate=true;

    let color=geometry.getAttribute('color');
    if(!color||color.array?.length!==prepared.colors.length){
      color=new THREE.BufferAttribute(new Float32Array(prepared.colors.length),3);
      geometry.setAttribute('color',color);
    }
    color.array.set(prepared.colors);
    color.needsUpdate=true;
    ground.rotation?.set?.(0,0,0);
    ground.position?.set?.(0,0,0);
    ground.updateMatrix?.();
    const ms=now()-started;
    p923Perf.maxGroundCommitMs=Math.max(p923Perf.maxGroundCommitMs,ms);
    return {ok:true,ms};
  }

  function buildRoadMeshes(profile){
    if(profile.length<=1)return;
    const roadVolume=buildRoadVolume(profile);
    if(roadVolume)roadGroup.add(roadVolume);
    const leftShoulder=buildLateralBand(profile,5.20,3.75,shoulderMat,.035);
    if(leftShoulder)roadGroup.add(leftShoulder);
    const rightShoulder=buildLateralBand(profile,-3.75,-5.20,shoulderMat,.035);
    if(rightShoulder)roadGroup.add(rightShoulder);
    const asphaltRoad=buildRibbon(profile,7.5,roadMat,ROAD_SURFACE_OFFSET);
    if(asphaltRoad)roadGroup.add(asphaltRoad);
    const center=buildOffsetRibbon(profile,0,.13,lineYellow,.165);
    if(center)roadGroup.add(center);
    for(const off of [-3.45,3.45]){
      const em=buildOffsetRibbon(profile,off,.10,lineWhite,.16);
      if(em)roadGroup.add(em);
    }
  }

  function finishWorld(profile,{preparedGround=null,preparedMeta=null}={}){
    const totalStarted=now();
    let phaseStarted=totalStarted;
    const phases={};
    const lap=name=>{
      const current=now();
      phases[name]=current-phaseStarted;
      phaseStarted=current;
    };

    resetStreamedWorldOrigins();
    terrainService.resetRoadBedOrigin?.();
    clearGroup(roadGroup);clearGroup(forestGroup);
    clearGroup(infrastructureGroup);clearGroup(signGroup);
    sceneryRenderer.clear();
    lap('resetClear');
    setActiveRoadProfile(profile);
    lap('roadProfile');
    let groundCommit={ok:false,ms:0};
    if(preparedGround)groundCommit=commitGroundBuffers(preparedGround);
    lap('terrainRoadBed');
    buildRoadMeshes(profile);
    lap('roadMeshes');
    rebuildLocalWater();
    lap('water');
    scheduleVisualJob('scenery',rebuildLocalScenery,220);
    addEnhancedBridgeFurniture();
    refreshRoadSignsOnly();
    lap('furniture');
    freezeStaticMatrices(roadGroup);
    freezeStaticMatrices(forestGroup);
    freezeStaticMatrices(infrastructureGroup);
    freezeStaticMatrices(signGroup);
    scheduleVisualJob('horizon',rebuildHorizon,260);
    markStaticShadowsDirty();
    lap('finalize');

    return {
      totalMs:now()-totalStarted,
      profilePoints:profile.length,
      terrainProfilePoints:preparedMeta?.terrainProfilePoints||0,
      phases,
      terrain:terrainService.diagnostics?.()||null,
      p923:preparedMeta?{...preparedMeta,groundCommitMs:groundCommit.ms}:null
    };
  }

  function rebuild(){
    const totalStarted=now();
    let phaseStarted=totalStarted;
    const phases={};
    const lap=name=>{
      const current=now();
      phases[name]=current-phaseStarted;
      phaseStarted=current;
    };

    resetStreamedWorldOrigins();
    terrainService.resetRoadBedOrigin?.();
    clearGroup(roadGroup);clearGroup(forestGroup);
    clearGroup(infrastructureGroup);clearGroup(signGroup);
    sceneryRenderer.clear();
    lap('resetClear');
    if(getBridgeFeatureCount())rebuildBridgeSpans();
    lap('bridges');
    const profile=buildRoadProfile();
    setActiveRoadProfile(profile);
    lap('roadProfile');
    const terrainProfile=terrainTransitionProfile(profile);
    terrainService.setRoadBed(terrainProfile,roadBedOptionsForProfile(profile));
    lap('terrainRoadBed');
    buildRoadMeshes(profile);
    lap('roadMeshes');
    rebuildLocalWater();
    lap('water');
    scheduleVisualJob('scenery',rebuildLocalScenery,220);
    addEnhancedBridgeFurniture();
    refreshRoadSignsOnly();
    lap('furniture');
    freezeStaticMatrices(roadGroup);
    freezeStaticMatrices(forestGroup);
    freezeStaticMatrices(infrastructureGroup);
    freezeStaticMatrices(signGroup);
    scheduleVisualJob('horizon',rebuildHorizon,260);
    markStaticShadowsDirty();
    lap('finalize');

    return {
      totalMs:now()-totalStarted,
      profilePoints:profile.length,
      terrainProfilePoints:terrainProfile.length,
      phases,
      terrain:terrainService.diagnostics?.()||null,
      p923:null
    };
  }

  async function prepareIncremental(){
    const serial=++prepareSerial;
    const wallStarted=now();
    p923Perf.preparations++;
    if(getBridgeFeatureCount())rebuildBridgeSpans();
    if(serial!==prepareSerial)return null;

    const profile=buildRoadProfile();
    const terrainProfile=terrainTransitionProfile(profile);
    const offset={...(getWorldOffset?.()||{x:0,z:0})};
    const install=installTerrainRoadStateFast(
      terrainProfile,
      roadBedOptionsForProfile(profile)
    );
    p923Perf.maxRoadStateInstallMs=Math.max(
      p923Perf.maxRoadStateInstallMs,install.ms
    );
    if(serial!==prepareSerial)return null;

    const groundPrepared=await prepareGroundBuffers(serial,offset);
    if(serial!==prepareSerial||!groundPrepared){
      p923Perf.discarded++;
      return null;
    }

    const meta={
      serial,
      preparedOffset:{...offset},
      terrainProfilePoints:terrainProfile.length,
      roadStateInstallMs:install.ms,
      roadStateBypassedGround:install.bypassed,
      prepareWallMs:now()-wallStarted,
      prepareCpuMs:
        groundPrepared.stats.heightCpuMs+
        groundPrepared.stats.normalCpuMs+
        groundPrepared.stats.colorCpuMs,
      prepareSlices:groundPrepared.stats.slices,
      maxPrepareSliceMs:groundPrepared.stats.maxSliceMs,
      preparedVertices:groundPrepared.stats.vertices
    };
    p923Perf.last=meta;
    return {serial,profile,terrainProfile,offset,groundPrepared,meta};
  }

  function commitPrepared(prepared){
    if(!prepared||prepared.serial!==prepareSerial){
      p923Perf.discarded++;
      return null;
    }
    const current=getWorldOffset?.()||{x:0,z:0};
    if(Math.hypot(current.x-prepared.offset.x,current.z-prepared.offset.z)>.5){
      p923Perf.discarded++;
      return null;
    }
    p923Perf.preparedCommits++;
    return finishWorld(prepared.profile,{
      preparedGround:prepared.groundPrepared,
      preparedMeta:prepared.meta
    });
  }

  function cancelPreparation(){prepareSerial++;}
  function p923Diagnostics(){
    return {
      preparations:p923Perf.preparations,
      preparedCommits:p923Perf.preparedCommits,
      discarded:p923Perf.discarded,
      maxSliceMs:Number(p923Perf.maxSliceMs.toFixed(3)),
      maxRoadStateInstallMs:Number(p923Perf.maxRoadStateInstallMs.toFixed(3)),
      maxGroundCommitMs:Number(p923Perf.maxGroundCommitMs.toFixed(3)),
      last:p923Perf.last
    };
  }

  const api={
    rebuild,
    prepareIncremental,
    commitPrepared,
    cancelPreparation,
    p923Diagnostics
  };
  try{globalThis.__WORLD_DRIVE_P923_LOCAL_WORLD__=api;}catch{}
  return api;
}

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

    // P9.22: only the explicitly tagged regular near-ground grid takes the
    // O(vertices) height-gradient path. Every other geometry keeps Three.js'
    // stock area-weighted triangle implementation unchanged.
    if(
      Number.isInteger(segments)&&segments>1&&
      positions?.itemSize===3&&
      positions.count===grid*grid&&
      positions.array
    ){
      let normals=this.getAttribute?.('normal');
      if(
        !normals||
        normals.itemSize!==3||
        normals.count!==positions.count||
        normals.array?.length!==positions.array.length
      ){
        normals=new THREE.BufferAttribute(
          new Float32Array(positions.array.length),
          3
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
          nx*=inv;ny*=inv;nz*=inv;
          n[out]=nx;
          n[out+1]=ny;
          n[out+2]=nz;
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

  // The transition ribbon has a hard 9 m continuity fuse in terrain.js.
  // Stay safely below it while removing redundant 2-4 m samples on straights.
  const MAX_STEP=8.25;
  const TURN_SINE_KEEP=.032;       // ~1.8 degrees local heading change
  const GRADE_DELTA_KEEP=.012;     // 1.2 percentage-point grade change
  const ROLL_DELTA_KEEP=.0045;     // ~0.26 degrees banking change

  const result=[profile[0]];
  let lastKept=profile[0];

  for(let i=1;i<profile.length-1;i++){
    const prev=profile[i-1];
    const cur=profile[i];
    const next=profile[i+1];

    const spanToNext=Math.hypot(
      next.x-lastKept.x,
      next.z-lastKept.z
    );

    const v0x=cur.x-prev.x;
    const v0z=cur.z-prev.z;
    const v1x=next.x-cur.x;
    const v1z=next.z-cur.z;
    const len0=Math.hypot(v0x,v0z)||1;
    const len1=Math.hypot(v1x,v1z)||1;
    const turnSine=Math.abs(v0x*v1z-v0z*v1x)/(len0*len1);

    const grade0=Number.isFinite(cur.y)&&Number.isFinite(prev.y)
      ?(cur.y-prev.y)/len0
      :0;
    const grade1=Number.isFinite(next.y)&&Number.isFinite(cur.y)
      ?(next.y-cur.y)/len1
      :grade0;

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

export function createLocalWorldBuilder({
  THREE,
  resetStreamedWorldOrigins,
  terrainService,
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

    // CRITICAL: bridge deck heights depend on terrain elevation at their approaches.
    // Elevation tiles, floating-origin shifts and asynchronous loads can all change
    // terrainAbs(). Recompute bridge spans BEFORE rebuilding the road every time.
    if(getBridgeFeatureCount()) rebuildBridgeSpans();
    lap('bridges');

    const profile=buildRoadProfile();
    setActiveRoadProfile(profile);
    lap('roadProfile');

    // P9.22: physics/asphalt keep the full engineered profile. The terrain cut
    // and visual transition use an adaptively thinned copy because their ~30 m
    // corridor does not need multiple nearly-collinear samples every few metres.
    // Sharp turns, grade changes and banking changes remain at full density.
    const terrainProfile=terrainTransitionProfile(profile);

    // Cut terrain fragments directly below the road corridor so coarse DEM
    // triangles can never protrude through asphalt or shoulders.
    terrainService.setRoadBed(terrainProfile,{
      roadHalfWidth:5.4,
      terrainCutHalfWidth:16.5,
      blendWidth:14.0,
      surfaceOffset:0.20,

      // A small terrain platform is tied to the FIRST route sample, not to the
      // nearest X/Z branch. This keeps every departure stable even when another
      // switchback passes almost directly above or below it.
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
    });
    lap('terrainRoadBed');

    if(profile.length>1){
      const roadVolume=buildRoadVolume(profile);
      if(roadVolume)roadGroup.add(roadVolume);

      const leftShoulder=buildLateralBand(
        profile,
        5.20,
        3.75,
        shoulderMat,
        .035
      );
      if(leftShoulder)roadGroup.add(leftShoulder);

      const rightShoulder=buildLateralBand(
        profile,
        -3.75,
        -5.20,
        shoulderMat,
        .035
      );
      if(rightShoulder)roadGroup.add(rightShoulder);

      const asphaltRoad=buildRibbon(
        profile,
        7.5,
        roadMat,
        ROAD_SURFACE_OFFSET
      );
      if(asphaltRoad)roadGroup.add(asphaltRoad);

      const center=buildOffsetRibbon(
        profile,
        0,
        .13,
        lineYellow,
        .165
      );
      if(center)roadGroup.add(center);

      for(const off of [-3.45,3.45]){
        const em=buildOffsetRibbon(
          profile,
          off,
          .10,
          lineWhite,
          .16
        );
        if(em)roadGroup.add(em);
      }
    }
    lap('roadMeshes');

    // Forest ownership is intentionally delegated entirely to sceneryRenderer.
    // The previous cylinder/cone fallback lived here as a second independent
    // forest and produced the visibly repetitive placeholder trees. Keeping a
    // single owner also prevents duplicate instances during streamed rebuilds.

    rebuildLocalWater();
    lap('water');

    scheduleVisualJob(
      'scenery',
      rebuildLocalScenery,
      220
    );

    addEnhancedBridgeFurniture();
    refreshRoadSignsOnly();
    lap('furniture');

    freezeStaticMatrices(roadGroup);
    freezeStaticMatrices(forestGroup);
    freezeStaticMatrices(infrastructureGroup);
    freezeStaticMatrices(signGroup);

    scheduleVisualJob(
      'horizon',
      rebuildHorizon,
      260
    );
    markStaticShadowsDirty();
    lap('finalize');

    return {
      totalMs:now()-totalStarted,
      profilePoints:profile.length,
      terrainProfilePoints:terrainProfile.length,
      phases,
      terrain:terrainService.diagnostics?.()||null
    };
  }

  return {rebuild};
}

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

    // Cut terrain fragments directly below the road corridor so coarse DEM
    // triangles can never protrude through asphalt or shoulders.
    terrainService.setRoadBed(profile,{
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
      phases,
      terrain:terrainService.diagnostics?.()||null
    };
  }

  return {rebuild};
}

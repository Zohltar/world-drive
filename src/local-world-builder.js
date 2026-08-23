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
  nearestRoute,
  isWaterAt,
  terrainAbs,
  treeTrunkMat,
  treeMat,
  rebuildLocalWater,
  scheduleVisualJob,
  rebuildLocalScenery,
  addEnhancedBridgeFurniture,
  refreshRoadSignsOnly,
  freezeStaticMatrices,
  rebuildHorizon,
  markStaticShadowsDirty,
}){
  function rebuild(){
    const worldOffset=getWorldOffset();
   
    resetStreamedWorldOrigins();
    terrainService.resetRoadBedOrigin?.();
    clearGroup(roadGroup);clearGroup(forestGroup);
    clearGroup(infrastructureGroup);clearGroup(signGroup);
    sceneryRenderer.clear();
   
    // CRITICAL: bridge deck heights depend on terrain elevation at their approaches.
    // Elevation tiles, floating-origin shifts and asynchronous loads can all change
    // terrainAbs(). Recompute bridge spans BEFORE rebuilding the road every time.
    if(getBridgeFeatureCount()) rebuildBridgeSpans();
   
    const profile=buildRoadProfile();
    setActiveRoadProfile(profile);
   
    // Cut terrain fragments directly below the road corridor so coarse DEM
    // triangles can never protrude through asphalt or shoulders.
    terrainService.setRoadBed(profile,{
      // V21.15.2: geometry-only road clearance. No stencil/depth trickery.
      // The safety cut extends well past the shoulder so coarse mountain
      // triangles cannot bridge across the pavement on extreme cross-slopes.
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
   
    if(profile.length>1){
      // Solid 3D road body first; flat top layers are then drawn over it.
      const roadVolume=buildRoadVolume(profile);
      if(roadVolume)roadGroup.add(roadVolume);
   
      // V21.19: shoulders are SIDE-ONLY bands. The old 10.4 m shoulder ribbon
      // continued underneath the entire 7.5 m asphalt ribbon. On highly twisted
      // mountain quads those two triangulated surfaces could intersect and show up
      // as the large diagonal beige wedges seen in extreme terrain.
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
   
      // White edge lines use the same bounded cross-section frame as the asphalt.
      // They can no longer calculate their own conflicting tangent on a hairpin.
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
   
    // Lightweight boreal forest, deterministic around the current render origin.
    // Instancing avoids recreating hundreds of individual geometries on each stream
    // refresh and also cuts the resulting draw-call count dramatically.
    let seed=Math.floor(worldOffset.x/90)*73856093 ^ Math.floor(worldOffset.z/90)*19349663;
    function rnd(){seed=(seed*1664525+1013904223)|0;return ((seed>>>0)/4294967296)}
   
    const nearTrees=[];
    const farTrees=[];
   
    for(let i=0;i<170;i++){
      const rx=(rnd()-.5)*1700;
      const rz=(rnd()-.5)*1700;
      const absx=worldOffset.x+rx;
      const absz=worldOffset.z+rz;
      const n=nearestRoute(absx,absz);
   
      if(n&&n.d<16)continue;
      if(isWaterAt(absx,absz,7))continue;
   
      const scale=.7+rnd()*.8;
      const y=terrainAbs(absx,absz);
      const dist=Math.hypot(rx,rz);
   
      if(dist<520){
        nearTrees.push({rx,rz,y,scale});
      }else if(dist<900 || i%3===0){
        farTrees.push({rx,rz,y,scale});
      }
    }
   
    const dummy=new THREE.Object3D();
   
    if(nearTrees.length){
      const trunkGeom=new THREE.CylinderGeometry(.12,.18,1.5,6);
      const crownGeom=new THREE.ConeGeometry(.9,3.4,7);
   
      const trunks=new THREE.InstancedMesh(
        trunkGeom,
        treeTrunkMat,
        nearTrees.length
      );
   
      const crowns=new THREE.InstancedMesh(
        crownGeom,
        treeMat,
        nearTrees.length
      );
   
      for(let i=0;i<nearTrees.length;i++){
        const t=nearTrees[i];
   
        dummy.position.set(
          t.rx,
          t.y+.75*t.scale,
          t.rz
        );
        dummy.scale.setScalar(t.scale);
        dummy.rotation.set(0,0,0);
        dummy.updateMatrix();
        trunks.setMatrixAt(i,dummy.matrix);
   
        dummy.position.set(
          t.rx,
          t.y+2.35*t.scale,
          t.rz
        );
        dummy.updateMatrix();
        crowns.setMatrixAt(i,dummy.matrix);
      }
   
      trunks.instanceMatrix.needsUpdate=true;
      crowns.instanceMatrix.needsUpdate=true;
      forestGroup.add(trunks,crowns);
    }
   
    if(farTrees.length){
      const crownGeom=new THREE.ConeGeometry(.9,3.4,6);
   
      const crowns=new THREE.InstancedMesh(
        crownGeom,
        treeMat,
        farTrees.length
      );
   
      for(let i=0;i<farTrees.length;i++){
        const t=farTrees[i];
   
        dummy.position.set(
          t.rx,
          t.y+2.15*t.scale,
          t.rz
        );
        dummy.scale.setScalar(t.scale);
        dummy.rotation.set(0,0,0);
        dummy.updateMatrix();
        crowns.setMatrixAt(i,dummy.matrix);
      }
   
      crowns.instanceMatrix.needsUpdate=true;
      forestGroup.add(crowns);
    }
   
    // terrainService.setRoadBed() already rebuilt the main terrain geometry above.
    // The old rebuildGroundTerrain() here rebuilt the exact same ~120x120 mesh a
    // second time and was a major avoidable frame spike.
    rebuildLocalWater();
   
    scheduleVisualJob(
      'scenery',
      rebuildLocalScenery,
      220
    );
   
    addEnhancedBridgeFurniture();
    refreshRoadSignsOnly();
   
    // Static meshes keep their exact V21.21.7 visual quality; only matrix update
    // bookkeeping is removed from subsequent frames.
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
   
  }

  return {rebuild};
}

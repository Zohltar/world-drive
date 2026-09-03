// Canonical World Drive static world-scene composition.
// Owns Three group/ground construction and static matrix/origin helpers only;
// mutable world offset, streaming policy and terrain rebuild policy remain outside.

export const NEAR_TERRAIN_SIZE=5600;
export const NEAR_TERRAIN_SEGMENTS=448;

export function freezeStaticMatrices(root){
  root.traverse(obj=>{
    if(obj.matrixAutoUpdate){
      obj.updateMatrix();
      obj.matrixAutoUpdate=false;
    }
  });
}

export function resetStaticGroupOrigin(group){
  group.position.set(0,0,0);
  group.updateMatrix();
}

export function createWorldScene({THREE,scene}){
  const world=new THREE.Group(),
        terrainDetailGroup=new THREE.Group(),
        waterGroup=new THREE.Group(),
        infrastructureGroup=new THREE.Group(),
        signGroup=new THREE.Group(),
        sceneryInfrastructureGroup=new THREE.Group(),
        buildingGroup=new THREE.Group(),
        roadGroup=new THREE.Group(),
        forestGroup=new THREE.Group(),
        sceneryForestGroup=new THREE.Group(),
        horizonGroup=new THREE.Group();

  world.add(
    terrainDetailGroup,
    waterGroup,
    infrastructureGroup,
    signGroup,
    sceneryInfrastructureGroup,
    buildingGroup,
    roadGroup,
    forestGroup,
    sceneryForestGroup,
    horizonGroup
  );
  scene.add(world);

  // Streamed world geometry is static between rebuilds. Freezing local matrices
  // removes redundant matrix recomputation without changing geometry or visuals.
  freezeStaticMatrices(world);

  // Public ordered contract: streaming-coordinator consumes this exact set/order.
  const streamedWorldGroups=[
    terrainDetailGroup,
    waterGroup,
    infrastructureGroup,
    signGroup,
    sceneryInfrastructureGroup,
    buildingGroup,
    roadGroup,
    forestGroup,
    sceneryForestGroup,
    horizonGroup
  ];

  // Satellite chunks use stencil ref 2; the procedural DEM underlay rejects
  // those pixels so independently triangulated surfaces do not z-fight.
  const groundMat=new THREE.MeshStandardMaterial({
    color:0xffffff,
    vertexColors:true,
    roughness:1,
    metalness:0,
    stencilWrite:true,
    stencilRef:2,
    stencilFunc:THREE.NotEqualStencilFunc,
    stencilFail:THREE.KeepStencilOp,
    stencilZFail:THREE.KeepStencilOp,
    stencilZPass:THREE.KeepStencilOp
  });
  const ground=new THREE.Mesh(
    new THREE.PlaneGeometry(NEAR_TERRAIN_SIZE,NEAR_TERRAIN_SIZE,88,88),
    groundMat
  );
  ground.rotation.x=-Math.PI/2;
  ground.receiveShadow=true;
  ground.renderOrder=-5;
  scene.add(ground);

  // Issue #4: retire the legacy road-terrain transition presentation. Human
  // A/B on Manic-5 and Yungas found the refined main ground cleaner in Photo OFF
  // and Photo ON without this helper ribbon. Keep geometry/material/depth/physics
  // contracts intact for now and suppress presentation only.
  const retireRoadTerrainTransition=group=>{
    if(![
      'road-terrain-transition',
      'road-terrain-transition-p927-hold'
    ].includes(group?.name))return group;

    group.visible=false;
    return group;
  };

  const originalSceneAdd=scene.add;
  scene.add=function(...objects){
    for(const object of objects)retireRoadTerrainTransition(object);
    return originalSceneAdd.apply(this,objects);
  };

  function resetStreamedWorldOrigins(){
    for(const group of streamedWorldGroups)resetStaticGroupOrigin(group);
    ground?.position?.set?.(0,0,0);
    ground?.updateMatrix?.();
  }

  return {
    world,
    terrainDetailGroup,
    waterGroup,
    infrastructureGroup,
    signGroup,
    sceneryInfrastructureGroup,
    buildingGroup,
    roadGroup,
    forestGroup,
    sceneryForestGroup,
    horizonGroup,
    streamedWorldGroups,
    groundMat,
    ground,
    resetStreamedWorldOrigins
  };
}

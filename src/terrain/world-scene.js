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

  // Issue #4 candidate: the road-terrain transition already has distinct
  // geometry and render order. Do not additionally bias its depth values away
  // from the camera: on long shallow overlaps that bias can make the helper
  // ribbon win/lose depth in large triangle-shaped patches in Photo OFF.
  // Preserve geometry, vertex colours, lighting, shadows, stencil, depth test
  // and depth writes; remove polygon offset only.
  const normalizeTransitionDepth=group=>{
    if(![
      'road-terrain-transition',
      'road-terrain-transition-p927-hold'
    ].includes(group?.name))return group;

    group.traverse?.(child=>{
      if(!child?.isMesh)return;
      const materials=Array.isArray(child.material)?child.material:[child.material];
      for(const material of materials){
        if(!material)continue;
        material.polygonOffset=false;
        material.needsUpdate=true;
      }
    });
    return group;
  };

  const originalSceneAdd=scene.add;
  scene.add=function(...objects){
    for(const object of objects)normalizeTransitionDepth(object);
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

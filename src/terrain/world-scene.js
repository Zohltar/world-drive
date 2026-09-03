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

  // Issue #4 diagnostic candidate: preserve the exact basic-material probe state
  // but hide the whole transition group so the user can compare the underlying
  // procedural terrain directly against the visible green ribbon candidate.
  const transitionBasicTint=0x6f8150;
  const createTransitionBasicMaterial=source=>{
    const material=new THREE.MeshBasicMaterial({
      color:transitionBasicTint,
      vertexColors:false,
      side:source?.side??THREE.DoubleSide,
      fog:source?.fog!==false,
      transparent:false,
      opacity:1,
      depthTest:source?.depthTest!==false,
      depthWrite:source?.depthWrite!==false,
      polygonOffset:source?.polygonOffset===true,
      polygonOffsetFactor:Number(source?.polygonOffsetFactor)||0,
      polygonOffsetUnits:Number(source?.polygonOffsetUnits)||0
    });

    for(const key of [
      'depthFunc',
      'depthTest',
      'depthWrite',
      'colorWrite',
      'polygonOffset',
      'polygonOffsetFactor',
      'polygonOffsetUnits',
      'stencilWrite',
      'stencilWriteMask',
      'stencilFunc',
      'stencilRef',
      'stencilFuncMask',
      'stencilFail',
      'stencilZFail',
      'stencilZPass'
    ]){
      if(source&&key in source)material[key]=source[key];
    }

    return material;
  };

  const normalizeTransitionBasicMaterial=group=>{
    if(![
      'road-terrain-transition',
      'road-terrain-transition-p927-hold'
    ].includes(group?.name))return group;

    group.visible=false;

    group.traverse?.(child=>{
      if(!child?.isMesh||child.userData?.issue4BasicTransitionMaterial)return;
      const oldMaterials=Array.isArray(child.material)?child.material:[child.material];
      const nextMaterials=oldMaterials.map(source=>createTransitionBasicMaterial(source));
      child.material=Array.isArray(child.material)?nextMaterials:nextMaterials[0];
      for(const source of oldMaterials)source?.dispose?.();
      child.receiveShadow=false;
      child.castShadow=false;
      child.userData={
        ...(child.userData||{}),
        issue4BasicTransitionMaterial:true
      };
    });

    return group;
  };

  const originalSceneAdd=scene.add;
  scene.add=function(...objects){
    for(const object of objects)normalizeTransitionBasicMaterial(object);
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

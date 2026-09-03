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
  ground.name='near-terrain-ground';
  ground.rotation.x=-Math.PI/2;
  ground.receiveShadow=true;
  ground.renderOrder=-5;
  scene.add(ground);

  function resetStreamedWorldOrigins(){
    for(const group of streamedWorldGroups)resetStaticGroupOrigin(group);
    ground?.position?.set?.(0,0,0);
    ground?.updateMatrix?.();
  }

  // Issue #4 temporary diagnostic: isolate which already-existing scene layer
  // owns the fixed Photo-OFF dark geometry. No visibility changes occur until a
  // caller explicitly invokes set(). Keep this owner dependency-free: publication
  // waits briefly for the canonical diagnostics root that main/runtime initializes.
  const layerRoots={
    ground,
    terrainDetail:terrainDetailGroup,
    water:waterGroup,
    infrastructure:infrastructureGroup,
    signs:signGroup,
    sceneryInfrastructure:sceneryInfrastructureGroup,
    buildings:buildingGroup,
    road:roadGroup,
    forest:forestGroup,
    sceneryForest:sceneryForestGroup,
    horizon:horizonGroup
  };
  const dynamicMatches=name=>{
    if(name==='transition')return scene.children.filter(child=>
      child?.name==='road-terrain-transition'||
      child?.name==='road-terrain-transition-p927-hold'
    );
    if(name==='satellite')return scene.children.filter(child=>child?.name==='satellite-terrain-chunks');
    return [];
  };
  const layerObjects=name=>layerRoots[name]?[layerRoots[name]]:dynamicMatches(name);
  const transitionMeshes=()=>dynamicMatches('transition').flatMap(object=>[...(object.children||[])].filter(child=>child?.isMesh));
  const transitionMaterials=()=>transitionMeshes().flatMap(mesh=>Array.isArray(mesh.material)?mesh.material:[mesh.material]).filter(Boolean);
  const transitionShadowState=()=>{
    const meshes=transitionMeshes();
    return {
      meshes:meshes.length,
      receiveShadow:meshes.length?meshes.every(mesh=>mesh.receiveShadow!==false):null,
      values:meshes.map(mesh=>!!mesh.receiveShadow)
    };
  };
  const transitionStencilState=()=>{
    const materials=transitionMaterials();
    return {
      materials:materials.length,
      stencilWrite:materials.length?materials.every(material=>material.stencilWrite!==false):null,
      values:materials.map(material=>!!material.stencilWrite)
    };
  };
  const issue4Layers={
    names:()=>[...Object.keys(layerRoots),'transition','satellite'],
    list:()=>Object.fromEntries(
      [...Object.keys(layerRoots),'transition','satellite'].map(name=>{
        const objects=layerObjects(name);
        return [name,{
          objects:objects.length,
          visible:objects.length?objects.every(object=>object.visible!==false):null,
          children:objects.reduce((sum,object)=>sum+(object.children?.length||0),0)
        }];
      })
    ),
    set:(name,visible=true)=>{
      const objects=layerObjects(String(name));
      for(const object of objects)object.visible=!!visible;
      return {name:String(name),visible:!!visible,objects:objects.length,state:issue4Layers.list()[String(name)]??null};
    },
    transitionShadow:(receive=true)=>{
      for(const mesh of transitionMeshes())mesh.receiveShadow=!!receive;
      return transitionShadowState();
    },
    transitionStencil:(enabled=true)=>{
      for(const material of transitionMaterials()){
        material.stencilWrite=!!enabled;
        material.needsUpdate=true;
      }
      return transitionStencilState();
    },
    restore:()=>{
      for(const name of Object.keys(layerRoots))for(const object of layerObjects(name))object.visible=true;
      for(const name of ['transition','satellite'])for(const object of layerObjects(name))object.visible=true;
      for(const mesh of transitionMeshes())mesh.receiveShadow=true;
      for(const material of transitionMaterials()){
        material.stencilWrite=true;
        material.needsUpdate=true;
      }
      return issue4Layers.list();
    }
  };
  let publishAttempts=0;
  const publishIssue4Layers=()=>{
    const diagnostics=globalThis.WorldDriveDiagnostics;
    if(diagnostics?.presentation){
      diagnostics.presentation.issue4Layers=issue4Layers;
      return true;
    }
    if(++publishAttempts<40)globalThis.setTimeout?.(publishIssue4Layers,25);
    return false;
  };
  publishIssue4Layers();

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

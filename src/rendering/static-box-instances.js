// Shared renderer primitive for large homogeneous sets of static box-shaped
// features. Each call owns its unit geometry so ordinary scene-group disposal
// remains safe across streamed-world rebuilds.
export function createStaticBoxInstances({
  THREE,
  material,
  transforms,
  name='static-boxes',
  kind='static-box',
  castShadow=false,
  receiveShadow=false
}){
  if(!THREE||!material||!Array.isArray(transforms)||!transforms.length)return null;
  const valid=transforms.filter(item=>
    item&&
    [
      item.x,item.y,item.z,item.width,item.height,item.depth,
      item.pitch??0,item.yaw??0,item.roll??0
    ].every(Number.isFinite)&&
    item.width>0&&item.height>0&&item.depth>0
  );
  if(!valid.length)return null;

  const geometry=new THREE.BoxGeometry(1,1,1);
  const mesh=new THREE.InstancedMesh(geometry,material,valid.length);
  const transform=new THREE.Object3D();
  for(let i=0;i<valid.length;i++){
    const item=valid[i];
    transform.position.set(item.x,item.y,item.z);
    transform.rotation.set(item.pitch||0,item.yaw||0,item.roll||0,'YXZ');
    transform.scale.set(item.width,item.height,item.depth);
    transform.updateMatrix();
    mesh.setMatrixAt(i,transform.matrix);
  }
  mesh.name=name;
  mesh.userData.worldDriveInstanceKind=kind;
  mesh.count=valid.length;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.instanceMatrix.needsUpdate=true;
  mesh.castShadow=!!castShadow;
  mesh.receiveShadow=!!receiveShadow;
  mesh.frustumCulled=true;
  mesh.computeBoundingSphere?.();
  mesh.matrixAutoUpdate=false;
  mesh.updateMatrix();
  return mesh;
}

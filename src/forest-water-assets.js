// Shared compact GLB assets extracted from the supplied low-poly scene.
// Trees are normalized once at load time so instances have a predictable size.
let assetPromise=null;
let cached=null;

export function loadForestWaterAssets(){
  if(cached)return Promise.resolve(cached);
  if(assetPromise)return assetPromise;

  assetPromise=(async()=>{
    const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
    const loader=new GLTFLoader();
    const gltf=await loader.loadAsync('/assets/world_drive_forest_water_geometry.glb');

    const trees=[];
    for(let i=0;i<3;i++){
      const key=String(i).padStart(2,'0');
      const barkObj=gltf.scene.getObjectByName(`Tree_${key}_bark`);
      const leavesObj=gltf.scene.getObjectByName(`Tree_${key}_leaves`);
      if(!barkObj?.geometry||!leavesObj?.geometry)continue;

      const bark=barkObj.geometry.clone();
      const leaves=leavesObj.geometry.clone();
      bark.computeBoundingBox();
      leaves.computeBoundingBox();

      const minX=Math.min(bark.boundingBox.min.x,leaves.boundingBox.min.x);
      const maxX=Math.max(bark.boundingBox.max.x,leaves.boundingBox.max.x);
      const minY=Math.min(bark.boundingBox.min.y,leaves.boundingBox.min.y);
      const maxY=Math.max(bark.boundingBox.max.y,leaves.boundingBox.max.y);
      const minZ=Math.min(bark.boundingBox.min.z,leaves.boundingBox.min.z);
      const maxZ=Math.max(bark.boundingBox.max.z,leaves.boundingBox.max.z);
      const centerX=(minX+maxX)*.5;
      const centerZ=(minZ+maxZ)*.5;
      const height=Math.max(.001,maxY-minY);
      const authoredToMeters=10/height;

      for(const geometry of [bark,leaves]){
        geometry.translate(-centerX,-minY,-centerZ);
        geometry.scale(authoredToMeters,authoredToMeters,authoredToMeters);
        geometry.computeBoundingSphere();
      }

      trees.push({bark,leaves});
    }

    const waterObj=gltf.scene.getObjectByName('WaterSample');
    const waterMaterial=waterObj?.material?.clone?.()||null;
    if(waterMaterial){
      waterMaterial.transparent=true;
      waterMaterial.depthWrite=false;
      if('roughness' in waterMaterial)waterMaterial.roughness=.08;
      if('metalness' in waterMaterial)waterMaterial.metalness=0;
      waterMaterial.opacity=Math.min(.82,Number(waterMaterial.opacity)||.72);
    }

    cached={trees,waterMaterial};
    return cached;
  })().catch(error=>{
    console.warn('Forest/water GLB asset load failed',error);
    assetPromise=null;
    return {trees:[],waterMaterial:null};
  });

  return assetPromise;
}

export function getForestWaterAssets(){
  return cached;
}

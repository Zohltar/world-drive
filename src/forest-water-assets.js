// Shared compact GLB geometry extracted from the supplied low-poly scene.
// Keeps only three reusable tree variants plus one water-surface sample.
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
      const bark=gltf.scene.getObjectByName(`Tree_${key}_bark`);
      const leaves=gltf.scene.getObjectByName(`Tree_${key}_leaves`);
      if(bark?.geometry&&leaves?.geometry){
        trees.push({
          bark:bark.geometry,
          leaves:leaves.geometry
        });
      }
    }

    const water=gltf.scene.getObjectByName('WaterSample')?.geometry||null;
    cached={trees,water};
    return cached;
  })().catch(error=>{
    console.warn('Forest/water GLB asset load failed',error);
    assetPromise=null;
    return {trees:[],water:null};
  });

  return assetPromise;
}

export function getForestWaterAssets(){
  return cached;
}

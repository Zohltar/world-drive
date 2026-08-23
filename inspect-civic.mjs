import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const loader=new GLTFLoader();
const url=new URL('./src/assets/2006_honda_civic_si.glb', import.meta.url);
const gltf=await loader.loadAsync(url.href);
const root=gltf.scene||gltf.scenes[0];
function line(obj,depth=0){
  const ind=' '.repeat(depth*2);
  const mats=(obj.isMesh||obj.isSkinnedMesh)?(Array.isArray(obj.material)?obj.material:[obj.material]).map(m=>m?.name).join(', '):'';
  console.log(`${ind}${obj.type} | ${obj.name} ${mats?`| mats: ${mats}`:''}`);
  for(const c of obj.children) line(c,depth+1);
}
line(root);

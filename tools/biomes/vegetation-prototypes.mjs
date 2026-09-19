/**
 * Isolated authoring gallery, NOT the production forest asset registry.
 * Five original geometric silhouettes + the unchanged certified conifer.
 * No borrowed GLB/texture, species claim, network, clock, randomness or game hook.
 */
import {buildForestProxyAssets} from '../../src/forest-proxy-assets.js';
import {VEGETATION_PROTOTYPES,buildVegetationPrototypeData} from './vegetation-prototype-data.mjs';
export {VEGETATION_PROTOTYPES,buildVegetationPrototypeData};
const freeze=Object.freeze;
/** Explicit gallery construction only. Does not mutate existing cached assets. */
export function buildVegetationPrototypes(THREE) {
  if(!THREE?.BufferGeometry||!THREE?.Float32BufferAttribute) throw new TypeError('THREE required');
  const proxies=buildForestProxyAssets(THREE),reference=proxies.find(a=>a.name==='proxy-mid');
  for(const a of proxies)if(a!==reference)for(const p of a.parts){p.geometry.dispose();p.material.dispose();}
  if(!reference)throw new Error('Certified conifer missing');
  const material=reference.parts[0].material;
  const assets=[{...reference,...VEGETATION_PROTOTYPES[0],name:VEGETATION_PROTOTYPES[0].id}];
  for(const d of VEGETATION_PROTOTYPES.slice(1)){
    const data=buildVegetationPrototypeData(d.id),geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(data.normals,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(data.colors,3));
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    assets.push({...d,name:d.id,parts:[{geometry,material}],normalizedHeight:geometry.boundingBox.max.y,proxy:true});
  }
  let disposed=false;
  return {assets:freeze(assets),dispose(){
    if(disposed)return;disposed=true;
    for(const a of assets)for(const p of a.parts)p.geometry.dispose();
    material.dispose();
  }};
}

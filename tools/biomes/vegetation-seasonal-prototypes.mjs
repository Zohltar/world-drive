/** Isolated seasonal gallery; does not import into or alter the driving scene. */
import {buildVegetationPrototypes} from './vegetation-prototypes.mjs';
import {WINTER_VARIANTS,buildWinterVegetationData} from './vegetation-winter-data.mjs';
export {WINTER_VARIANTS,seasonalVegetationId} from './vegetation-winter-data.mjs';

export function buildSeasonalVegetationPrototypes(THREE) {
  const summer=buildVegetationPrototypes(THREE),winter=[];
  const reference=summer.assets[0].parts[0],material=reference.material;
  let disposed=false;
  function dispose(){
    if(disposed)return;disposed=true;
    for(const asset of winter)asset.parts[0].geometry.dispose();
    summer.dispose();
  }
  try {
    for(const descriptor of WINTER_VARIANTS) {
      const data=buildWinterVegetationData(descriptor.id,{
        positions:reference.geometry.attributes.position.array,
        colors:reference.geometry.attributes.color.array,indices:reference.geometry.index.array
      });
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));
      geometry.setAttribute('normal',new THREE.Float32BufferAttribute(data.normals,3));
      geometry.setAttribute('color',new THREE.Float32BufferAttribute(data.colors,3));
      geometry.computeBoundingBox();geometry.computeBoundingSphere();
      winter.push(Object.freeze({...descriptor,name:descriptor.id,parts:[{geometry,material}],
        surfaces:data.surfaces,normalizedHeight:geometry.boundingBox.max.y,proxy:true}));
    }
    const winterAssets=Object.freeze(winter),assets=Object.freeze([...summer.assets,...winter]);
    return Object.freeze({summerAssets:summer.assets,winterAssets,assets,dispose,
      getAssets(season){
        if(disposed)throw new Error('Seasonal gallery disposed');
        if(season==='summer')return summer.assets;
        if(season==='winter')return winterAssets;
        throw new TypeError('Season must be summer or winter');
      }
    });
  } catch(error){dispose();throw error;}
}

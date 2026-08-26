import * as THREE from 'three';
import {buildForestProxyAssets} from './forest-proxy-assets.js';
import {AUTHORED_WATER_STYLE} from './forest-authored-lite.js';

let cached=null;
let loading=null;

export function loadForestWaterAssets(){
  if(cached)return Promise.resolve(cached);
  if(loading)return loading;

  loading=Promise.resolve().then(()=>{
    // P8.1: the lightweight conifer proxies are visually sufficient for World
    // Drive and dramatically cheaper than mixing authored GLB foliage into the
    // near field. Keep only two purpose-built LOD meshes:
    //   proxy-mid = 68 triangles for near + medium forest
    //   proxy-far = 20 triangles for distant forest
    //
    // scenery-renderer already falls back to the first available variant for
    // authored/ps1/scene lookups, so LOD0 and LOD1 naturally resolve to
    // proxy-mid while LOD2 resolves to proxy-far. No GLB parsing, textures or
    // alpha foliage materials are loaded for the forest anymore.
    const trees=buildForestProxyAssets(THREE);

    cached={
      pine:trees[0],
      trees,
      waterStyle:AUTHORED_WATER_STYLE,
      source:'P8.1 lightweight proxy forest only'
    };

    console.info(
      `Forest assets ready: proxy-only · ${trees.length} LODs · `+
      `${trees.reduce((sum,t)=>sum+(t.triangles||0),0)} source triangles`
    );

    return cached;
  });

  return loading;
}

export function getForestWaterAssets(){
  return cached;
}

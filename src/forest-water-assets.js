import * as THREE from 'three';
import {buildForestProxyAssets} from './forest-proxy-assets.js';
import {AUTHORED_WATER_STYLE} from './forest-authored-lite.js';

let cached=null;

export function loadForestWaterAssets(){
  if(cached)return Promise.resolve(cached);

  // P9.11 unified low-definition forest.
  // The approved 68-triangle proxy already gives the desired World Drive look
  // at distance, so use that exact model for every visible LOD. This removes all
  // forest GLB parsing, texture upload and alpha-cutout foliage cost at startup.
  // The 20-triangle proxy remains available in simpleTrees for later experiments,
  // but it is deliberately not rendered in this profile so the forest silhouette
  // stays visually consistent from the car to the horizon.
  const simpleTrees=buildForestProxyAssets(THREE);
  const simpleMid=simpleTrees.find(tree=>tree.name==='proxy-mid')||simpleTrees[0]||null;

  if(!simpleMid){
    cached={
      pine:null,
      trees:[],
      hdTrees:[],
      simpleTrees,
      forestProfile:'empty',
      waterStyle:AUTHORED_WATER_STYLE,
      source:'P9.11 no forest proxy available'
    };
    return Promise.resolve(cached);
  }

  // forest-chunk-streamer addresses two asset names (`proxy-mid` for near/mid
  // and `proxy-far` for far/edge). Alias both names to the SAME 68-triangle
  // geometry/material so LOD state changes affect density only, never tree style.
  const near={...simpleMid,name:'proxy-mid',sourceName:simpleMid.name,hd:false};
  const distant={...simpleMid,name:'proxy-far',sourceName:simpleMid.name,hd:false};

  cached={
    pine:simpleMid,
    trees:[near,distant],
    hdTrees:[],
    simpleTrees,
    forestProfile:'unified-lowdef-68',
    waterStyle:AUTHORED_WATER_STYLE,
    source:'P9.11 unified 68-triangle low-definition forest'
  };

  console.info(
    `Forest assets ready: unified low-def · ${simpleMid.triangles} triangles / tree · no GLB loading`
  );

  return Promise.resolve(cached);
}

export function getForestWaterAssets(){
  return cached;
}

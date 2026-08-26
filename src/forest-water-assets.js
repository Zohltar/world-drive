import * as THREE from 'three';
import {buildPineTreeAsset} from './pine-tree-runtime.js';
import {AUTHORED_WATER_STYLE} from './forest-authored-lite.js';

let cached=null;

export function loadForestWaterAssets(){
  if(cached)return Promise.resolve(cached);
  const pine=buildPineTreeAsset(THREE);
  cached={
    pine,
    trees:[],
    waterStyle:AUTHORED_WATER_STYLE,
    source:'pine_tree_01.glb'
  };
  console.info(`Forest assets ready: supplied pine · ${pine.triangles} triangles per tree`);
  return Promise.resolve(cached);
}

export function getForestWaterAssets(){
  return cached;
}

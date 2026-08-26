import * as THREE from 'three';
import {buildAuthoredTreeGeometries,AUTHORED_WATER_STYLE} from './forest-authored-lite.js';

let cached=null;

export function loadForestWaterAssets(){
  if(cached)return Promise.resolve(cached);

  cached={
    trees:buildAuthoredTreeGeometries(THREE),
    waterStyle:AUTHORED_WATER_STYLE,
    source:'supplied-glb-authored-lite'
  };

  console.info(`Forest assets ready: ${cached.trees.length} authored tree variants`);
  return Promise.resolve(cached);
}

export function getForestWaterAssets(){
  return cached;
}

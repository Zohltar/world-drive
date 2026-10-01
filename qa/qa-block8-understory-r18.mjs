import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildR18Atlas,buildR18RouteIndex,buildUnderstoryStyle,r18Admission,r18Transform,
  R18_MIN_ROUTE_M,R18_MAX_ROUTE_M,R18_UNDERSTORY} from '../tools/biomes/understory-layer-r18.mjs';

const cases=[];function check(name,fn){fn();cases.push(name);}
const origin={lon:7,lat:50};
const scale=Math.PI/180*6378137,cos=Math.cos(origin.lat*Math.PI/180);
const ll=(x,z)=>[origin.lon+x/(scale*cos),origin.lat-z/scale];
const coordinates=[ll(0,0),ll(240,0),ll(480,120),ll(720,120)];
const route=buildR18RouteIndex({coordinates,origin});
check('bounded route index returns exact roadside distances',()=>{
  assert.ok(Math.abs(route.distance(120,50)-50)<1e-6);assert.ok(route.distance(120,200)>R18_MAX_ROUTE_M);
  const d=route.diagnostics();assert.equal(d.points,4);assert.ok(d.cells>0&&d.references>0&&d.maxSegmentM<2000);
});
check('route bounds reject oversized segments and point counts',()=>{
  assert.throws(()=>buildR18RouteIndex({coordinates:[ll(0,0),ll(2500,0)],origin}),/segment bound/);
  assert.throws(()=>buildR18RouteIndex({coordinates:Array.from({length:20001},(_,i)=>ll(i,0)),origin}),/point bound/);
});
check('admission is strictly 36-76m and deterministic with a sparser edge',()=>{
  assert.equal(r18Admission(0,0,10,10,R18_MIN_ROUTE_M-0.01),false);assert.equal(r18Admission(0,0,10,10,R18_MAX_ROUTE_M+0.01),false);
  for(const d of [36,48,60,70,76])assert.equal(r18Admission(2,-3,123.25,88.5,d),r18Admission(2,-3,123.25,88.5,d));
  let inner=0,outer=0;for(let i=0;i<500;i++){inner+=r18Admission(1,2,i*.17,i*.31,45)?1:0;outer+=r18Admission(1,2,i*.17,i*.31,73)?1:0;}
  assert.ok(inner>outer*1.8,`${inner}/${outer}`);
});
check('stable transforms remain below the declared footprint scale',()=>{
  for(let i=0;i<200;i++){const a=r18Transform(2,4,i*.9,i*1.7),b=r18Transform(2,4,i*.9,i*1.7);assert.deepEqual(a,b);assert.ok(a.sx<=2.25&&a.sz<=2.10&&a.sy<=1.85);}
});
const atlas=buildR18Atlas();
check('R18 owns a copied 256x256 atlas with an authored fern tile',()=>{
  assert.equal(atlas.width,256);assert.equal(atlas.height,256);assert.equal(atlas.data.byteLength,262144);
  let opaque=0;for(let y=128;y<256;y++)for(let x=128;x<256;x++)if(atlas.data[(y*256+x)*4+3]>0)opaque++;assert.ok(opaque>100);
});
const style=buildUnderstoryStyle(THREE);
function fernBounds(asset){
  const p=asset.geometry.attributes.position.array,uv=asset.geometry.attributes.uv.array;
  let maxY=-Infinity,maxR=0,count=0;
  for(let i=0;i<asset.geometry.attributes.position.count;i++){
    if(uv[i*2]<130/256||uv[i*2+1]<130/256)continue;
    const x=p[i*3],y=p[i*3+1],z=p[i*3+2];maxY=Math.max(maxY,y);maxR=Math.max(maxR,Math.hypot(x,z));count++;
  }
  return {count,maxY,maxR};
}
check('summer and winter clumps hit the exact triangle budgets with one shared material',()=>{
  const s=style.asset('summer'),w=style.asset('winter'),d=style.diagnostics();
  assert.equal(s.geometry.attributes.position.count/3,336);assert.equal(w.geometry.attributes.position.count/3,576);
  assert.equal(s.material,w.material);assert.equal(d.sharedMaterials,1);assert.equal(d.transparent,false);assert.equal(d.alphaTest,.34);
  assert.ok(d.maxScaledFootprintRadius<=3.1,d.maxScaledFootprintRadius);assert.equal(d.id,R18_UNDERSTORY);
});
check('fern cards remain visibly substantial without exceeding the R18 footprint budget',()=>{
  const summer=fernBounds(style.asset('summer')),winter=fernBounds(style.asset('winter'));
  assert.ok(summer.count>0&&summer.maxY>1.85&&summer.maxR>1.03,JSON.stringify(summer));
  assert.ok(winter.count>0&&winter.maxY>1.32&&winter.maxR>.97,JSON.stringify(winter));
});
style.dispose();check('owned R18 assets dispose without touching R17 runtime assets',()=>assert.equal(style.diagnostics().disposed,true));
const report={status:'PASS',groups:cases.length,cases,route:route.diagnostics(),atlasBytes:atlas.data.byteLength};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));

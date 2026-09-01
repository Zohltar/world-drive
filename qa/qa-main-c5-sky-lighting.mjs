import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSkyLighting } from '../src/sky-lighting.js';

class Vec3{
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
  copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}
  addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;}
  normalize(){const n=Math.hypot(this.x,this.y,this.z)||1;this.x/=n;this.y/=n;this.z/=n;return this;}
}
class HemisphereLight{
  constructor(color,groundColor,intensity){this.color=color;this.groundColor=groundColor;this.intensity=intensity;this.position=new Vec3();}
}
class DirectionalLight{
  constructor(color,intensity){
    this.color=color;this.intensity=intensity;this.position=new Vec3();this.castShadow=false;
    this.shadow={mapSize:{x:0,y:0,set:(x,y)=>{this.shadow.mapSize.x=x;this.shadow.mapSize.y=y;}},camera:{}};
  }
}
class CanvasTexture{
  constructor(canvas){this.canvas=canvas;this.colorSpace=null;this.needsUpdate=false;}
}
class SpriteMaterial{constructor(options={}){Object.assign(this,options);}}
class Sprite{
  constructor(material){this.material=material;this.position=new Vec3();this.scale=new Vec3(1,1,1);this.renderOrder=0;this.visible=true;}
}

const gradients=[];
const canvas={width:0,height:0};
const ctx={
  fillStyle:'',globalCompositeOperation:'source-over',
  clearRect(){},beginPath(){},arc(){},fill(){},
  createRadialGradient(...args){
    const gradient={args,stops:[],addColorStop(offset,color){this.stops.push([offset,color]);}};
    gradients.push(gradient);
    return gradient;
  }
};
canvas.getContext=type=>{assert.equal(type,'2d');return ctx;};
const documentRef={createElement(tag){assert.equal(tag,'canvas');return canvas;}};
const THREE={
  HemisphereLight,
  DirectionalLight,
  CanvasTexture,
  SpriteMaterial,
  Sprite,
  Vector3:Vec3,
  SRGBColorSpace:'srgb'
};
const scene={added:[],add(obj){this.added.push(obj);}};
const camera={position:new Vec3(10,20,30)};

const sky=createSkyLighting({THREE,scene,camera,documentRef});
assert.equal(scene.added.length,4,'sky-light scene ownership changed');
assert.deepEqual(scene.added,[sky.hemi,sky.sun,sky.moonLight,sky.moonSprite],'sky-light add order changed');

assert.equal(sky.hemi.color,0xd6ecff,'hemisphere sky color changed');
assert.equal(sky.hemi.groundColor,0x4e6345,'hemisphere ground color changed');
assert.equal(sky.hemi.intensity,2.15,'hemisphere intensity changed');

assert.equal(sky.sun.color,0xfff2d2,'sun color changed');
assert.equal(sky.sun.intensity,2.6,'sun intensity changed');
assert.deepEqual([sky.sun.position.x,sky.sun.position.y,sky.sun.position.z],[-180,260,-120],'sun position changed');
assert.equal(sky.sun.castShadow,true,'sun shadow ownership changed');
assert.deepEqual([sky.sun.shadow.mapSize.x,sky.sun.shadow.mapSize.y],[1024,1024],'sun shadow map size changed');
assert.deepEqual([
  sky.sun.shadow.camera.left,
  sky.sun.shadow.camera.right,
  sky.sun.shadow.camera.top,
  sky.sun.shadow.camera.bottom
],[-300,300,300,-300],'sun shadow camera envelope changed');

assert.equal(sky.moonLight.color,0xb9d7ff,'moon light color changed');
assert.equal(sky.moonLight.intensity,0,'moon light startup intensity changed');
assert.equal(sky.moonLight.castShadow,false,'moon light shadow policy changed');
assert.equal(canvas.width,256,'moon canvas width changed');
assert.equal(canvas.height,256,'moon canvas height changed');
assert.equal(gradients.length,1,'moon halo gradient count changed');
assert.deepEqual(gradients[0].args,[128,128,42,128,128,116],'moon halo gradient geometry changed');
assert.deepEqual(gradients[0].stops,[
  [0,'rgba(218,232,255,.25)'],
  [.55,'rgba(190,215,255,.09)'],
  [1,'rgba(170,205,255,0)']
],'moon halo gradient colors changed');

assert.equal(sky.moonMaterial.map.colorSpace,'srgb','moon texture color space changed');
assert.equal(sky.moonMaterial.map.needsUpdate,true,'moon texture update flag changed');
assert.equal(sky.moonMaterial.color,0xe8f2ff,'moon sprite color changed');
assert.equal(sky.moonMaterial.transparent,true,'moon transparency changed');
assert.equal(sky.moonMaterial.opacity,0,'moon startup opacity changed');
assert.equal(sky.moonMaterial.depthWrite,false,'moon depthWrite changed');
assert.equal(sky.moonMaterial.depthTest,false,'moon depthTest changed');
assert.equal(sky.moonMaterial.fog,false,'moon fog policy changed');
assert.deepEqual([sky.moonSprite.scale.x,sky.moonSprite.scale.y,sky.moonSprite.scale.z],[115,115,1],'moon sprite scale changed');
assert.equal(sky.moonSprite.renderOrder,-5,'moon render order changed');
assert.equal(sky.moonSprite.visible,false,'moon startup visibility changed');

const expectedDir=new Vec3(.35,.72,-.60).normalize();
assert.ok(Math.abs(sky.moonDirection.x-expectedDir.x)<1e-12,'moon direction x changed');
assert.ok(Math.abs(sky.moonDirection.y-expectedDir.y)<1e-12,'moon direction y changed');
assert.ok(Math.abs(sky.moonDirection.z-expectedDir.z)<1e-12,'moon direction z changed');
sky.updateMoonSkyPosition();
for(const [actual,scale,label] of [
  [sky.moonSprite.position,3100,'sprite'],
  [sky.moonLight.position,850,'light']
]){
  assert.ok(Math.abs(actual.x-(camera.position.x+expectedDir.x*scale))<1e-9,`${label} x positioning changed`);
  assert.ok(Math.abs(actual.y-(camera.position.y+expectedDir.y*scale))<1e-9,`${label} y positioning changed`);
  assert.ok(Math.abs(actual.z-(camera.position.z+expectedDir.z*scale))<1e-9,`${label} z positioning changed`);
}

const main=fs.readFileSync('src/main.js','utf8');
const lines=main.split(/\r?\n/).length;
assert.match(main,/from ['"]\.\/sky-lighting\.js['"]/,'main does not import canonical sky lighting');
assert.match(main,/createSkyLighting\(\{THREE,scene,camera,documentRef:document\}\)/,'main does not compose sky lighting');
assert.doesNotMatch(main,/function createCrescentMoonTexture\s*\(/,'main still owns moon texture creation');
assert.doesNotMatch(main,/const hemi=new THREE\.HemisphereLight/,'main still owns static sky-light creation');
assert.match(main,/createEnvironmentController\(\{[\s\S]*?hemi,[\s\S]*?sun,[\s\S]*?moonLight,[\s\S]*?moonMaterial,[\s\S]*?moonSprite,[\s\S]*?moonDirection,[\s\S]*?updateMoonSkyPosition,/,'environment controller lost sky-light contract');
assert.match(main,/if\(now>=perfGovernor\.nextMoonAt\)\{[\s\S]*?updateMoonSkyPosition\(\);/,'animate lost moon update cadence');
assert.ok(lines<2960,`C5.2 did not materially reduce main.js: ${lines} lines`);

console.log('CLEANUP C5.2 SKY LIGHTING QA: PASS',{
  mainLines:lines,
  visualConstantsPreserved:true,
  moonPositioningPreserved:true,
  environmentOwnershipPreserved:true,
  animateCadencePreserved:true
});

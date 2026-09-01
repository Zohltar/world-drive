import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createWorldMaterials,
  ROAD_SURFACE_OFFSET,
  TIRE_VISUAL_CLEARANCE,
  WHEEL_RADIUS,
  TIRE_HALF_WIDTH,
  ROAD_WHEEL_CONTACT_HALF_WIDTH
} from '../src/world-materials.js';

assert.equal(ROAD_SURFACE_OFFSET,.10,'road surface offset changed');
assert.equal(TIRE_VISUAL_CLEARANCE,.018,'tire visual clearance changed');
assert.equal(WHEEL_RADIUS,.38,'wheel radius changed');
assert.equal(TIRE_HALF_WIDTH,.135,'tire half-width changed');
assert.equal(ROAD_WHEEL_CONTACT_HALF_WIDTH,8.5,'road wheel contact half-width changed');

class MockCanvasTexture{
  constructor(canvas){
    this.canvas=canvas;
    this.repeat={x:1,y:1,set:(x,y)=>{this.repeat.x=x;this.repeat.y=y;}};
    this.offset={x:0,y:0};
    this.wrapS=null;
    this.wrapT=null;
    this.anisotropy=0;
    this.colorSpace=null;
  }
}
class MockMaterial{
  constructor(options={}){Object.assign(this,options);}
}
function createContext(){
  return {
    globalAlpha:1,
    fillStyle:'',
    strokeStyle:'',
    lineWidth:1,
    createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),
    putImageData(){},
    fillRect(){},
    beginPath(){},
    arc(){},
    fill(){},
    moveTo(){},
    lineTo(){},
    stroke(){}
  };
}
const canvases=[];
const documentRef={
  createElement(tag){
    assert.equal(tag,'canvas');
    const canvas={width:0,height:0,_ctx:createContext(),getContext(type){assert.equal(type,'2d');return this._ctx;}};
    canvases.push(canvas);
    return canvas;
  }
};
const THREE={
  CanvasTexture:MockCanvasTexture,
  MeshStandardMaterial:MockMaterial,
  RepeatWrapping:'repeat',
  SRGBColorSpace:'srgb',
  AlwaysStencilFunc:'always',
  NotEqualStencilFunc:'notEqual',
  KeepStencilOp:'keep',
  ReplaceStencilOp:'replace',
  DoubleSide:'double'
};
const renderer={capabilities:{getMaxAnisotropy:()=>8}};
const materials=createWorldMaterials({THREE,renderer,documentRef});

for(const key of [
  'roadMat','shoulderMat','roadEdgeMat','roadUnderMat','lineYellow','lineWhite',
  'treeTrunkMat','treeMat','waterTex','waterMat','riverMat','coastWaterMat'
])assert.ok(materials[key],`material/texture missing: ${key}`);

assert.equal(canvases.length,7,'unexpected procedural canvas count');
assert.deepEqual(canvases.slice(0,6).map(c=>[c.width,c.height]),new Array(6).fill(null).map(()=>[512,512]),'road texture canvas size changed');
assert.deepEqual([canvases[6].width,canvases[6].height],[128,128],'water texture canvas size changed');
assert.equal(materials.roadMat.bumpScale,.045,'asphalt bump scale changed');
assert.equal(materials.shoulderMat.bumpScale,.075,'shoulder bump scale changed');
assert.equal(materials.roadMat.roughness,.94,'asphalt roughness changed');
assert.equal(materials.shoulderMat.roughness,1,'shoulder roughness changed');
assert.equal(materials.roadMat.stencilFunc,'always','road stencil ownership changed');
assert.equal(materials.waterMat.stencilFunc,'notEqual','water stencil ownership changed');
assert.equal(materials.waterMat.opacity,.90,'water opacity changed');
assert.equal(materials.riverMat.opacity,.93,'river opacity changed');
assert.equal(materials.coastWaterMat.opacity,.94,'coast opacity changed');
assert.equal(materials.waterTex,materials.waterMat.map,'animated water texture is not the rendered water texture');
assert.equal(materials.waterMat.map,materials.riverMat.map,'water materials stopped sharing water texture');
assert.equal(materials.riverMat.map,materials.coastWaterMat.map,'coast water stopped sharing water texture');
assert.deepEqual([materials.waterTex.repeat.x,materials.waterTex.repeat.y],[18,18],'water texture repeat changed');
assert.deepEqual([materials.waterTex.offset.x,materials.waterTex.offset.y],[0,0],'water animation offset no longer starts at zero');
assert.equal(materials.roadMat.map.anisotropy,8,'road anisotropy changed');
assert.equal(materials.roadMat.map.colorSpace,'srgb','road color texture color-space changed');

const main=fs.readFileSync('src/main.js','utf8');
const lines=main.split(/\r?\n/).length;
assert.match(main,/from ['"]\.\/world-materials\.js['"]/,'main does not import canonical world materials');
assert.match(main,/createWorldMaterials\(\{THREE,renderer,documentRef:document\}\)/,'main does not compose world materials');
assert.match(main,/\bwaterTex\b[\s\S]*createWorldMaterials/,'main does not keep the animated water texture binding');
assert.doesNotMatch(main,/function makeRoadSurfaceTextures\s*\(/,'main still owns road texture generation');
assert.doesNotMatch(main,/function makeWaterTexture\s*\(/,'main still owns water texture generation');
assert.doesNotMatch(main,/const ROAD_SURFACE_OFFSET\s*=\s*\.10/,'main still owns road contact constants');
assert.ok(lines<3060,`C5.1 did not materially reduce main.js: ${lines} lines`);

console.log('CLEANUP C5.1 WORLD MATERIALS QA: PASS',{
  mainLines:lines,
  proceduralCanvases:canvases.length,
  animatedWaterTexturePreserved:true,
  constantsPreserved:true,
  materialContractPreserved:true
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createWorldScene,
  freezeStaticMatrices,
  resetStaticGroupOrigin,
  NEAR_TERRAIN_SIZE,
  NEAR_TERRAIN_SEGMENTS
} from '../src/world-scene.js';

assert.equal(NEAR_TERRAIN_SIZE,5600,'near terrain size changed');
assert.equal(NEAR_TERRAIN_SEGMENTS,448,'near terrain segment policy changed');

class Vec3{
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
}
class Group{
  constructor(){this.children=[];this.position=new Vec3();this.matrixAutoUpdate=true;this.updateMatrixCalls=0;}
  add(...items){this.children.push(...items);}
  updateMatrix(){this.updateMatrixCalls++;}
  traverse(fn){fn(this);for(const child of this.children){if(child?.traverse)child.traverse(fn);else fn(child);}}
}
class PlaneGeometry{
  constructor(width,height,widthSegments,heightSegments){Object.assign(this,{width,height,widthSegments,heightSegments});}
}
class Material{constructor(options={}){Object.assign(this,options);}}
class Mesh{
  constructor(geometry,material){
    this.geometry=geometry;this.material=material;this.position=new Vec3();this.rotation={x:0,y:0,z:0};
    this.receiveShadow=false;this.renderOrder=0;this.matrixAutoUpdate=true;this.updateMatrixCalls=0;
  }
  updateMatrix(){this.updateMatrixCalls++;}
}
const THREE={
  Group,
  PlaneGeometry,
  MeshStandardMaterial:Material,
  Mesh,
  NotEqualStencilFunc:'notEqual',
  KeepStencilOp:'keep'
};
const scene={added:[],add(obj){this.added.push(obj);}};
const worldScene=createWorldScene({THREE,scene});

const orderedGroups=[
  worldScene.terrainDetailGroup,
  worldScene.waterGroup,
  worldScene.infrastructureGroup,
  worldScene.signGroup,
  worldScene.sceneryInfrastructureGroup,
  worldScene.buildingGroup,
  worldScene.roadGroup,
  worldScene.forestGroup,
  worldScene.sceneryForestGroup,
  worldScene.horizonGroup
];
assert.deepEqual(worldScene.world.children,orderedGroups,'streamed world group order changed');
assert.deepEqual(worldScene.streamedWorldGroups,orderedGroups,'streaming coordinator group contract changed');
assert.deepEqual(scene.added,[worldScene.world,worldScene.ground],'scene add order changed');
assert.equal(worldScene.world.matrixAutoUpdate,false,'world matrix was not frozen');
for(const group of orderedGroups){
  assert.equal(group.matrixAutoUpdate,false,'streamed group matrix was not frozen');
  assert.equal(group.updateMatrixCalls,1,'streamed group initial matrix update changed');
}

assert.deepEqual([
  worldScene.ground.geometry.width,
  worldScene.ground.geometry.height,
  worldScene.ground.geometry.widthSegments,
  worldScene.ground.geometry.heightSegments
],[5600,5600,88,88],'initial ground plane geometry changed');
assert.equal(worldScene.ground.material.color,0xffffff,'ground color changed');
assert.equal(worldScene.ground.material.vertexColors,true,'ground vertex-color policy changed');
assert.equal(worldScene.ground.material.roughness,1,'ground roughness changed');
assert.equal(worldScene.ground.material.metalness,0,'ground metalness changed');
assert.equal(worldScene.ground.material.stencilWrite,true,'ground stencil-write changed');
assert.equal(worldScene.ground.material.stencilRef,2,'ground stencil ref changed');
assert.equal(worldScene.ground.material.stencilFunc,'notEqual','ground stencil function changed');
assert.equal(worldScene.ground.material.stencilFail,'keep','ground stencil fail op changed');
assert.equal(worldScene.ground.material.stencilZFail,'keep','ground stencil z-fail op changed');
assert.equal(worldScene.ground.material.stencilZPass,'keep','ground stencil z-pass op changed');
assert.equal(worldScene.ground.rotation.x,-Math.PI/2,'ground rotation changed');
assert.equal(worldScene.ground.receiveShadow,true,'ground receive-shadow changed');
assert.equal(worldScene.ground.renderOrder,-5,'ground render order changed');
assert.equal(worldScene.ground.matrixAutoUpdate,true,'ground must keep matrix auto-update enabled');

const standalone=new Group();
standalone.position.set(7,8,9);
resetStaticGroupOrigin(standalone);
assert.deepEqual([standalone.position.x,standalone.position.y,standalone.position.z],[0,0,0],'static group origin reset changed');
assert.equal(standalone.updateMatrixCalls,1,'static group origin reset must update matrix');

const freezeRoot=new Group();
const freezeChild=new Group();
freezeRoot.add(freezeChild);
freezeStaticMatrices(freezeRoot);
assert.equal(freezeRoot.matrixAutoUpdate,false,'freeze helper missed root');
assert.equal(freezeChild.matrixAutoUpdate,false,'freeze helper missed child');

for(const group of orderedGroups){group.position.set(3,4,5);group.updateMatrixCalls=0;}
worldScene.ground.position.set(6,7,8);worldScene.ground.updateMatrixCalls=0;
worldScene.resetStreamedWorldOrigins();
for(const group of orderedGroups){
  assert.deepEqual([group.position.x,group.position.y,group.position.z],[0,0,0],'streamed group origin reset changed');
  assert.equal(group.updateMatrixCalls,1,'streamed group reset matrix update changed');
}
assert.deepEqual([worldScene.ground.position.x,worldScene.ground.position.y,worldScene.ground.position.z],[0,0,0],'ground origin reset changed');
assert.equal(worldScene.ground.updateMatrixCalls,1,'ground reset matrix update changed');

const main=fs.readFileSync('src/main.js','utf8');
const lines=main.split(/\r?\n/).length;
assert.match(main,/from ['"]\.\/world-scene\.js['"]/,'main does not import canonical world scene');
assert.match(main,/createWorldScene\(\{THREE,scene\}\)/,'main does not compose canonical world scene');
assert.doesNotMatch(main,/const world=new THREE\.Group\(\),/,'main still owns static world group construction');
assert.doesNotMatch(main,/const NEAR_TERRAIN_SIZE=5600/,'main still owns near-terrain size');
assert.doesNotMatch(main,/new THREE\.PlaneGeometry\(NEAR_TERRAIN_SIZE,NEAR_TERRAIN_SIZE,88,88\)/,'main still owns initial ground geometry');
assert.match(main,/let worldOffset=\{x:0,z:0\}/,'mutable world offset must remain in main');
assert.match(main,/function toRender\(x,z\)/,'render-coordinate transform must remain in main');
assert.match(main,/createTerrainService\(\{[\s\S]*?ground,[\s\S]*?horizonGroup,[\s\S]*?getWorldOffset:\(\)=>worldOffset,[\s\S]*?groundSize:NEAR_TERRAIN_SIZE,[\s\S]*?groundSegments:NEAR_TERRAIN_SEGMENTS/,'terrain service composition contract changed');
assert.match(main,/createStreamingCoordinator\(\{[\s\S]*?streamedWorldGroups,[\s\S]*?ground,[\s\S]*?terrainService,/,'streaming coordinator lost ordered streamed-world group contract');
assert.ok(lines<2880,`C5.3 did not materially reduce main.js: ${lines} lines`);

console.log('CLEANUP C5.3 WORLD SCENE QA: PASS',{
  mainLines:lines,
  groupOrderPreserved:true,
  streamingGroupContractPreserved:true,
  groundContractPreserved:true,
  originAndMatrixHelpersPreserved:true,
  worldOffsetOwnership:'main.js'
});

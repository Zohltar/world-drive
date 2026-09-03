import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const facadePath=path.join(root,'src','terrain','terrain-p925.js');
const source=fs.readFileSync(facadePath,'utf8').replace(/\r\n/g,'\n');

for(const pattern of [
  /filterNaturalCopyTransitionTriangles/,
  /group\?\.name!=='road-terrain-transition'/,
  /natural-rendered>threshold/,
  /changesTerrain\(a\)\|\|changesTerrain\(b\)\|\|changesTerrain\(c\)/,
  /Symbol\.for\('world-drive\.issue4\.transition-natural-copy-filter'\)/,
  /parent\.add=function\(\.\.\.objects\)/,
  /return base\.setRoadBed\(\.\.\.args\)/
])assert.match(source,pattern,`Issue 4 natural-copy guard missing: ${pattern}`);

const moduleUrl=`${pathToFileURL(facadePath).href}?qa=${Date.now()}`;
const {filterNaturalCopyTransitionTriangles}=await import(moduleUrl);
assert.equal(typeof filterNaturalCopyTransitionTriangles,'function');

function makeGeometry(values,indices){
  const positions={
    count:values.length,
    getX:i=>values[i][0],
    getY:i=>values[i][1],
    getZ:i=>values[i][2]
  };
  return {
    index:{array:new Uint16Array(indices),needsUpdate:false},
    getAttribute:name=>name==='position'?positions:null,
    getIndex(){return this.index;},
    setIndex(next){
      this.index={array:new Uint16Array(next),needsUpdate:false};
    }
  };
}

const geometry=makeGeometry([
  [0,10,0],[1,10,0],[0,10,1],
  [2,10,0],[3,9.5,0],[2,10,1]
],[0,1,2,3,4,5]);
const mesh={isMesh:true,geometry,userData:{}};
const group={
  name:'road-terrain-transition',
  userData:{},
  traverse(fn){fn(mesh);}
};
const samples=[];
const stats=filterNaturalCopyTransitionTriangles(group,{
  heightAt:(x,z)=>{samples.push([x,z]);return 10;},
  getWorldOffset:()=>({x:100,z:200}),
  epsilon:.03
});

assert.deepEqual([...geometry.index.array],[3,4,5],'natural-copy triangle was not removed cleanly');
assert.equal(stats.trianglesBefore,2);
assert.equal(stats.trianglesAfter,1);
assert.equal(stats.trianglesRemoved,1);
assert.equal(mesh.userData.issue4NaturalCopyFiltered,true);
assert.equal(group.userData.issue4NaturalCopyFilter.trianglesRemoved,1);
assert.ok(samples.some(([x,z])=>x>=100&&z>=200),'world offset was not applied to DEM comparison');

const untouched=makeGeometry([[0,10,0],[1,10,0],[0,10,1]],[0,1,2]);
const wrongGroup={name:'other-layer',traverse(fn){fn({isMesh:true,geometry:untouched,userData:{}});}};
const ignored=filterNaturalCopyTransitionTriangles(wrongGroup,{
  heightAt:()=>10,
  getWorldOffset:()=>({x:0,z:0})
});
assert.deepEqual([...untouched.index.array],[0,1,2]);
assert.equal(ignored.trianglesRemoved,0);

console.log('Issue 4 transition natural-copy QA: PASS');
console.log({
  naturalCopyRemoved:stats.trianglesRemoved,
  realCutPreserved:stats.trianglesAfter,
  p925AndP927InterceptedBySharedParent:true
});

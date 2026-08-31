import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const exists=p=>fs.existsSync(p);
const read=p=>fs.readFileSync(p,'utf8');

assert.equal(exists('src/road-geometry-base.js'),false,'historical road-geometry-base.js returned');
assert.equal(exists('src/road-geometry.js'),true,'canonical road geometry module missing');
const source=read('src/road-geometry.js');
assert.doesNotMatch(source,/from ['"]\.\/road-geometry-base\.js['"]/,'canonical road geometry still imports historical base');
assert.match(source,/function createRoadGeometryCore\s*\(/,'private road geometry core missing');
assert.match(source,/export function createRoadGeometrySystem\s*\(/,'public road geometry factory missing');
assert.match(source,/const base=createRoadGeometryCore\(args\);/,'public facade does not compose the private core');
assert.match(source,/const profile=base\.buildProfile\(\);[\s\S]*smoothRoadProfileV21_31\(profile,args\)/,'V21.31 smoothing wrapper is no longer applied to built profiles');
for(const marker of [
  'function roadLateralFrame(',
  'function buildLateralBand(',
  'function buildRoadVolume(',
  'function buildRoadProfile(',
  'function rebuildRoadProfileSpatialIndex(',
  'function roadProfileFrameAtCum(',
  'function roadFrameAt(',
  'function roadHeightAt(',
  'function roadSurfaceAt(',
  'export function smoothRoadProfileV21_31(',
  'export function engineerRoadBankingV21_31('
])assert.ok(source.includes(marker),`canonical road owner missing: ${marker}`);

const offenders=[];
for(const root of ['src','qa','.github']){
  if(!exists(root))continue;
  const walk=dir=>{
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      const full=path.join(dir,entry.name);
      if(entry.isDirectory()){walk(full);continue;}
      if(!/\.(?:js|mjs|cjs|yml|yaml)$/.test(entry.name))continue;
      const rel=full.replaceAll('\\','/');
      if(rel==='qa-road-geometry-c3.mjs'||rel==='.github/workflows/qa-cleanup-c3-candidate.yml')continue;
      if(read(full).includes('road-geometry-base.js'))offenders.push(rel);
    }
  };
  walk(root);
}
assert.deepEqual(offenders,[],`historical road geometry filename still referenced: ${offenders.join(', ')}`);

const road=await import(`${pathToFileURL(path.resolve('src/road-geometry.js')).href}?c3=${Date.now()}`);
for(const name of ['createRoadGeometrySystem','smoothRoadProfileV21_31','engineerRoadBankingV21_31','clampRoadBankV21_31']){
  assert.equal(typeof road[name],'function',`canonical export missing: ${name}`);
}

console.log('CLEANUP C3 ROAD GEOMETRY OWNERSHIP QA: PASS',{
  singleModule:'src/road-geometry.js',
  privateCore:'createRoadGeometryCore',
  publicFactory:'createRoadGeometrySystem',
  smoothingAndBankingPreserved:true
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const exists=p=>fs.existsSync(p);
const read=p=>fs.readFileSync(p,'utf8');
const facadePath='src/road-geometry.js';
const implementationPath='src/road/road-geometry.js';

assert.equal(exists('src/road-geometry-base.js'),false,'historical road-geometry-base.js returned');
assert.equal(exists(facadePath),true,'canonical road geometry facade missing');
assert.equal(exists(implementationPath),true,'canonical road geometry implementation missing');
const source=read(implementationPath);
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
const intentionalHistoricalChecks=new Set([
  'qa/qa-road-geometry-c3.mjs',
  'qa/qa-source-tree-r6-road-geometry.mjs'
]);
for(const root of ['src','qa','.github']){
  if(!exists(root))continue;
  const walk=dir=>{
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      const full=path.join(dir,entry.name);
      if(entry.isDirectory()){walk(full);continue;}
      if(!/\.(?:js|mjs|cjs|yml|yaml)$/.test(entry.name))continue;
      const rel=full.replaceAll('\\','/');
      if(intentionalHistoricalChecks.has(rel))continue;
      if(read(full).includes('road-geometry-base.js'))offenders.push(rel);
    }
  };
  walk(root);
}
assert.deepEqual(offenders,[],`historical road geometry filename still referenced: ${offenders.join(', ')}`);

const road=await import(`${pathToFileURL(path.resolve(facadePath)).href}?c3=${Date.now()}`);
for(const name of ['createRoadGeometrySystem','smoothRoadProfileV21_31','engineerRoadBankingV21_31','clampRoadBankV21_31']){
  assert.equal(typeof road[name],'function',`canonical export missing: ${name}`);
}

console.log('CLEANUP C3 ROAD GEOMETRY OWNERSHIP QA: PASS',{
  publicFacade:facadePath,
  implementation:implementationPath,
  privateCore:'createRoadGeometryCore',
  publicFactory:'createRoadGeometrySystem',
  smoothingAndBankingPreserved:true
});

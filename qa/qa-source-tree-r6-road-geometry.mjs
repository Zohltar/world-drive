import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const facadePath='src/road-geometry.js';
const implementationPath='src/road/road-geometry.js';
const bridgePath='src/bridges.js';

assert.equal(fs.existsSync(facadePath),true,'road geometry root facade missing');
assert.equal(fs.existsSync(implementationPath),true,'nested road geometry implementation missing');
assert.equal(fs.existsSync(bridgePath),true,'bridge manager root boundary missing');
assert.equal(fs.existsSync('src/road-geometry-base.js'),false,'historical road-geometry-base.js must remain absent');

const facade=read(facadePath);
const implementation=read(implementationPath);
const main=read('src/main.js');

assert.equal(facade,"export * from './road/road-geometry.js';\n",'road geometry root facade changed');
assert.doesNotMatch(facade,/createRoadGeometryCore|ROAD_PROFILE_INDEX_CELL|GLOBAL_ROAD_BANKING/,'root facade owns implementation again');
assert.match(main,/from '\.\/road-geometry\.js'/,'main.js must keep the stable root road-geometry import');
assert.match(main,/from '\.\/bridges\.js'/,'main.js must keep the bridge manager root import');
assert.match(main,/bridgeHeightAtCum,/,'main.js must still inject bridge height into road geometry');
assert.match(implementation,/bridgeHeightAtCum,/,'road geometry implementation lost bridge height dependency');
assert.match(implementation,/if\(typeof bridgeHeightAtCum!==['"]function['"]\)throw new Error\('road geometry requires bridgeHeightAtCum'\);/,'road geometry bridge-height contract changed');
assert.match(implementation,/const by=bridgeHeightAtCum\(raw\[i\]\.cum\);if\(by!==null\)heights\[i\]=by;/,'bridge deck height override changed');
assert.match(implementation,/bridgeManager\.isNearApproach\(raw\[i\]\.cum,18\)/,'bridge approach smoothing contract changed');

const rootModule=await import('../src/road-geometry.js');
const implementationModule=await import('../src/road/road-geometry.js');
assert.deepEqual(Object.keys(rootModule).sort(),Object.keys(implementationModule).sort(),'root facade export surface differs from implementation');
for(const name of Object.keys(implementationModule)){
  assert.equal(rootModule[name],implementationModule[name],`root facade binding differs: ${name}`);
}

console.log('SOURCE TREE R6 ROAD GEOMETRY QA: PASS',{
  stableRootFacade:true,
  nestedImplementation:true,
  publicBindingsExact:true,
  bridgeBoundaryPreserved:true,
  historicalBaseAbsent:true
});

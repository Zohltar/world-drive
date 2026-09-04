import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const localPath=new URL('../src/local-world-builder.js',import.meta.url);
const sceneryPath=new URL('../src/scenery/scenery-renderer-p9.js',import.meta.url);
const local=fs.readFileSync(localPath,'utf8');
const scenery=fs.readFileSync(sceneryPath,'utf8');

for(const file of [localPath,sceneryPath]){
  const result=spawnSync(process.execPath,['--check',file.pathname],{encoding:'utf8'});
  if(result.status!==0)throw new Error(`Syntax check failed for ${file.pathname}\n${result.stderr||result.stdout}`);
}

assert.match(
  scenery,
  /function switchForestRouteCache\(routeKey\)\{\s*return forestStreamer\.switchRouteCache\(routeKey\);\s*\}/s,
  'scenery renderer must expose the real dense-forest route-cache owner'
);
assert.match(
  scenery,
  /switchForestRouteCache,[\s\S]*?forestStats:\(\)=>forestStreamer\.stats\(\)/s,
  'scenery renderer must expose route-cache switching and active forest stats together'
);

assert.match(
  local,
  /function alignForestToCommittedTerrain\(\)\{[\s\S]*?sceneryRenderer\?\.forestStats\?\.\(\)\?\.routeCacheKey[\s\S]*?sceneryRenderer\.switchForestRouteCache\(routeKey\)/s,
  'local-world builder must realign through sceneryRenderer using the active route-cache key'
);
assert.match(
  local,
  /function rebuild\(\.\.\.args\)\{[\s\S]*?const result=base\.rebuild\?\.\(\.\.\.args\);\s*if\(result\)alignForestToCommittedTerrain\(\);\s*return result;/s,
  'full local-world rebuild must realign retained forest before returning to the renderer'
);
assert.match(
  local,
  /const result=base\.commitPrepared\?\.\(prepared\);\s*if\(result\)alignForestToCommittedTerrain\(\);/s,
  'prepared terrain commit must realign retained forest in the same synchronous commit turn'
);
assert.match(
  local,
  /terrainAlignments:forestRetentionPerf\.terrainAlignments[\s\S]*?lastAlignedTrees:forestRetentionPerf\.lastAlignedTrees/s,
  'forest terrain-commit alignment diagnostics disappeared'
);

console.log('FOREST TERRAIN COMMIT ALIGNMENT R6 QA: PASS');
console.log('  - lifecycle and local-world commits use the real scenery forest owner');
console.log('  - full and prepared terrain commits realign forest before returning');

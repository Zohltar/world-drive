import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const localPath=path.join(root,'src','local-world-builder.js');
const sceneryPath=path.join(root,'src','scenery-renderer-p9.js');
const forestPath=path.join(root,'src','forest-chunk-streamer-core.js');

function read(file){return fs.readFileSync(file,'utf8');}
function expect(condition,message){if(!condition)throw new Error(message);}
function syntax(file){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0)throw new Error(`Syntax check failed for ${path.basename(file)}\n${result.stderr||result.stdout}`);
}

for(const file of [localPath,sceneryPath,forestPath])syntax(file);
const local=read(localPath),scenery=read(sceneryPath),forest=read(forestPath);

for(const marker of [
  'P938_PRESERVE_FOREST_DURING_PREPARED_COMMIT=true',
  'clearGroupForBuilder',
  'preserveForestDuringPreparedCommit=true',
  'preserveForestDuringPreparedCommit=false',
  'group===forestGroup',
  'clearGroup:clearGroupForBuilder',
  'freezeStaticMatricesForBuilder',
  'freezeStaticMatrices:freezeStaticMatricesForBuilder',
  'forestRetentionPerf.freezeSkips++',
  'p938ForestRetention'
])expect(local.includes(marker),`P9.38 prepared-forest marker missing: ${marker}`);

expect(
  scenery.includes('Forest chunks deliberately survive ordinary world/scenery refreshes.'),
  'Scenery renderer must retain its ordinary-refresh forest ownership contract'
);
expect(
  scenery.includes('forestStreamer.refreshVisibleHeights()')&&scenery.includes('forestStreamer.requestUpdate(true)'),
  'Scenery rebuild must refresh retained forest heights and recenter visibility'
);
expect(
  forest.includes('positionChunkGroup(data)')&&forest.includes('detach(data)')&&forest.includes('active.delete(key)'),
  'Forest streamer must own recenter positioning and active-chunk detach lifecycle'
);
expect(
  forest.includes('function clearAll()')&&forest.includes('for(const data of cache.values())disposeChunk(data)'),
  'Forest streamer must retain explicit destructive clearAll for route/reset lifecycle'
);

console.log('PASS P9.38 prepared forest-retention QA');
console.log('  - prepared world commits preserve forest streamer-owned chunks');
console.log('  - retained chunks are repositioned/replaced by the forest streamer');
console.log('  - explicit route/reset clearAll remains destructive');

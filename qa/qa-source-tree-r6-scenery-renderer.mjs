import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=file=>fs.readFileSync(file,'utf8');

const entryPath='src/scenery-renderer.js';
const basePath='src/scenery/scenery-renderer-p9.js';
const wrapperPath='src/scenery/scenery-renderer-p933.js';

for(const file of [entryPath,basePath,wrapperPath]){
  assert.equal(fs.existsSync(file),true,`R6 scenery file missing: ${file}`);
}
for(const file of ['src/scenery-renderer-p9.js','src/scenery-renderer-p933.js']){
  assert.equal(fs.existsSync(file),false,`R6 old root scenery implementation returned: ${file}`);
}

const entry=read(entryPath);
const base=read(basePath);
const wrapper=read(wrapperPath);
const main=read('src/main.js');

assert.match(entry,/export \{createSceneryRenderer\} from ['"]\.\/scenery\/scenery-renderer-p933\.js['"];?/,
  'stable root scenery entry must re-export nested P9.33+ implementation');
assert.doesNotMatch(entry,/function createSceneryRenderer\s*\(/,
  'stable root scenery entry must remain a facade');

assert.match(wrapper,/from ['"]\.\/scenery-renderer-p9\.js['"]/,
  'nested P9.33+ wrapper must compose nested P9 renderer');
assert.match(wrapper,/from ['"]\.\.\/forest-streaming-policy\.js['"]/,
  'nested P9.33+ wrapper must keep root forest-policy boundary');
assert.match(wrapper,/from ['"]\.\.\/diagnostics\.js['"]/,
  'nested P9.33+ wrapper must keep root diagnostics boundary');

assert.match(base,/from ['"]\.\.\/forest-water-assets\.js['"]/,
  'nested P9 renderer must keep root forest-water asset boundary');
assert.match(base,/from ['"]\.\.\/forest-chunk-streamer\.js['"]/,
  'nested P9 renderer must keep root forest-streamer boundary');

for(const marker of [
  'clearForestCache',
  'sceneryReadyForForest=true',
  'forestStreamer.refreshVisibleHeights()',
  'forestStreamer.requestUpdate(true)',
  'loadForestWaterAssets().then',
  'activateForestAssetsIfReady()'
])assert.ok(base.includes(marker),`R6 scenery lifecycle marker lost: ${marker}`);

for(const marker of [
  'DEFAULT_INITIAL_CHUNKS=14',
  'DEFAULT_FRONT_CHUNKS=8',
  'DEFAULT_FRONT_LEAD=2',
  'routeGeneration++',
  'directionalCoverage',
  '__WORLD_DRIVE_P935_FOREST_READY__'
])assert.ok(wrapper.includes(marker),`R6 scenery startup marker lost: ${marker}`);

assert.match(main,/from ['"]\.\/scenery-renderer\.js['"]/,
  'main must continue importing the stable root scenery entry');
assert.doesNotMatch(main,/scenery\/scenery-renderer-p(?:9|933)\.js/,
  'main must not bypass the stable root scenery entry');

for(const file of [
  'src/scenery-data.js',
  'src/forest-chunk-streamer.js',
  'src/forest-chunk-streamer-core.js',
  'src/forest-streaming-policy.js',
  'src/forest-terrain-sampler.js',
  'src/forest-water-assets.js',
  'src/water-data.js',
  'src/water-renderer.js',
  'src/terrain.js',
  'src/imagery.js',
  'src/streaming-coordinator.js'
])assert.equal(fs.existsSync(file),true,`R6 scenery sub-lot crossed protected boundary: ${file}`);

console.log('SOURCE TREE R6 SCENERY RENDERER QA: PASS',{
  publicEntry:entryPath,
  nestedBase:basePath,
  nestedStartupWrapper:wrapperPath,
  forestFamilyStillRoot:true,
  waterTerrainImageryStreamingUntouched:true
});

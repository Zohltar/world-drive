import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const src=path.join(root,'src');
const mainPath=path.join(src,'main.js');
const minimapFacadePath=path.join(src,'minimap.js');
const minimapPath=path.join(src,'ui','minimap.js');
const roadFurniturePath=path.join(src,'road','road-furniture-p930.js');
const routeLifecycleFacadePath=path.join(src,'route-lifecycle.js');
const routeLifecyclePath=path.join(src,'routing','route-lifecycle.js');

for(const filePath of [
  mainPath,
  minimapFacadePath,minimapPath,
  roadFurniturePath,
  routeLifecycleFacadePath,routeLifecyclePath
]){
  assert.equal(fs.existsSync(filePath),true,`${path.relative(root,filePath)} missing`);
}

const main=fs.readFileSync(mainPath,'utf8');
const minimapFacade=fs.readFileSync(minimapFacadePath,'utf8');
const minimap=fs.readFileSync(minimapPath,'utf8');
const roadFurniture=fs.readFileSync(roadFurniturePath,'utf8');
const routeLifecycleFacade=fs.readFileSync(routeLifecycleFacadePath,'utf8');
const routeLifecycle=fs.readFileSync(routeLifecyclePath,'utf8');

assert.match(minimapFacade,/export \* from ['"]\.\/ui\/minimap\.js['"];/,'minimap root facade changed');
assert.match(routeLifecycleFacade,/export \* from ['"]\.\/routing\/route-lifecycle\.js['"];/,'route-lifecycle root facade changed');

// Current ownership: road-furniture creates the guide descriptor and publishes
// it through the main composition callback. main only owns the current value.
for(const pattern of [
  /let currentRoadGuideSign=null;/,
  /setRoadGuideSign:value=>\{currentRoadGuideSign=value;\}/,
  /roadGuideSign:currentRoadGuideSign/
]){
  assert.match(main,pattern,`main.js missing current road-guide wiring: ${pattern}`);
}

for(const pattern of [
  /currentRoadGuideSign=\{/,
  /kind:'guide'/,
  /addRoadSignAt\(p,guideLabel,'guide',1\)/,
  /setRoadGuideSign\?\.\(currentRoadGuideSign\)/
]){
  assert.match(roadFurniture,pattern,`road-furniture-p930.js missing guide ownership: ${pattern}`);
}

// Route changes clear both the published guide and transient readout state.
for(const pattern of [
  /setState\(\{currentRoadGuideSign:null\}\)/,
  /resetMinimapSignReadout\(\)/
]){
  assert.match(routeLifecycle,pattern,`src/routing/route-lifecycle.js missing guide/readout reset: ${pattern}`);
}

// Minimap keeps the accepted 5 s transient display with fade and bidirectional
// re-arm behavior, consuming geographic and road-guide descriptors together.
for(const pattern of [
  /let roadGuideSign=null;/,
  /roadGuideSign=state\.roadGuideSign\|\|null;/,
  /duration:5000/,
  /fadeMs:1100/,
  /const candidates=roadGuideSign/,
  /\?\[\.\.\.geographicSigns,roadGuideSign\]/,
  /Math\.abs\(signDisplayCum\(f\)-nr\.cum\)>80/
]){
  assert.match(minimap,pattern,`src/ui/minimap.js missing bidirectional/road-guide behavior: ${pattern}`);
}

assert.doesNotMatch(
  minimap,
  /signDisplayCum\(f\)-nr\.cum>80/,
  'legacy one-way sign rearm logic is still present'
);

for(const filePath of [
  mainPath,
  minimapFacadePath,minimapPath,
  roadFurniturePath,
  routeLifecycleFacadePath,routeLifecyclePath
]){
  const result=spawnSync(process.execPath,['--check',filePath],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout||`${path.basename(filePath)} syntax check failed`);
}

console.log('V21.25 MINIMAP SIGN READOUT QA: PASS');
console.log('road-name guide: road-furniture owned; transient readout: 5 s + fade; sign rearm: bidirectional; R7 root facades retained');

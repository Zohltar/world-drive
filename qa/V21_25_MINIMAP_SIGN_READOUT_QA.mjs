import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const mainPath=path.join(root,'src','main.js');
const minimapPath=path.join(root,'src','minimap.js');
const roadFurniturePath=path.join(root,'src','road','road-furniture-p930.js');
const routeLifecyclePath=path.join(root,'src','route-lifecycle.js');

for(const filePath of [mainPath,minimapPath,roadFurniturePath,routeLifecyclePath]){
  assert.equal(fs.existsSync(filePath),true,`${path.relative(root,filePath)} missing`);
}

const main=fs.readFileSync(mainPath,'utf8');
const minimap=fs.readFileSync(minimapPath,'utf8');
const roadFurniture=fs.readFileSync(roadFurniturePath,'utf8');
const routeLifecycle=fs.readFileSync(routeLifecyclePath,'utf8');

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
  assert.match(routeLifecycle,pattern,`route-lifecycle.js missing guide/readout reset: ${pattern}`);
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
  assert.match(minimap,pattern,`minimap.js missing bidirectional/road-guide behavior: ${pattern}`);
}

assert.doesNotMatch(
  minimap,
  /signDisplayCum\(f\)-nr\.cum>80/,
  'legacy one-way sign rearm logic is still present'
);

for(const filePath of [mainPath,minimapPath,roadFurniturePath,routeLifecyclePath]){
  const result=spawnSync(process.execPath,['--check',filePath],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout||`${path.basename(filePath)} syntax check failed`);
}

console.log('V21.25 MINIMAP SIGN READOUT QA: PASS');
console.log('road-name guide: road-furniture owned; transient readout: 5 s + fade; sign rearm: bidirectional');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const mainPath=path.join(root,'src','main.js');
const minimapPath=path.join(root,'src','minimap.js');

assert.equal(fs.existsSync(mainPath),true,'src/main.js missing');
assert.equal(fs.existsSync(minimapPath),true,'src/minimap.js missing');

const main=fs.readFileSync(mainPath,'utf8');
const minimap=fs.readFileSync(minimapPath,'utf8');

for(const pattern of [
  /let currentRoadGuideSign=null;/,
  /currentRoadGuideSign=\{/,
  /kind:'guide'/,
  /roadGuideSign:currentRoadGuideSign/,
  /currentRoadGuideSign=null;\s*worldStreaming\.reset\(\)/
]){
  assert.match(main,pattern,`main.js missing road-guide readout integration: ${pattern}`);
}

for(const pattern of [
  /let roadGuideSign=null;/,
  /roadGuideSign=state\.roadGuideSign\|\|null;/,
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

for(const filePath of [mainPath,minimapPath]){
  const result=spawnSync(process.execPath,['--check',filePath],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout||`${path.basename(filePath)} syntax check failed`);
}

console.log('V21.25 MINIMAP SIGN READOUT QA: PASS');
console.log('road-name guide readout: wired; sign rearm: bidirectional');

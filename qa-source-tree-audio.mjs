import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8').replace(/\r\n/g,'\n');
const audioPath='src/audio.js';
const basePath='src/audio-base.js';

for(const file of [audioPath,basePath])assert.ok(fs.existsSync(file),`audio source missing: ${file}`);

const main=read('src/main.js');
const audio=read(audioPath);
const base=read(basePath);

assert.match(main,/from '\.\/audio\.js'/,'main must import the public audio module');
assert.match(audio,/from '\.\/audio-base\.js'/,'audio facade must import audio-base as sibling before migration');
assert.match(audio,/export \* from '\.\/audio-base\.js'/,'audio facade must preserve audio-base exports');
assert.doesNotMatch(audio,/import\(/,'audio facade must not hide dynamic imports');
assert.doesNotMatch(base,/import\(/,'audio-base must not hide dynamic imports');

for(const marker of [
  "new Audio('./assets/audio/tire-squeal.mp3')",
  "const TIRE_SAMPLE_URL='./assets/audio/tire-squeal.mp3'",
  "const BRAKE_SAMPLE_URL='./assets/audio/brake-squeal.mp3'"
]){
  assert.ok(audio.includes(marker)||base.includes(marker),`application-relative audio asset contract missing: ${marker}`);
}
assert.doesNotMatch(audio,/new URL\([^\n]*import\.meta\.url/,'audio facade unexpectedly owns import.meta.url asset depth');
assert.doesNotMatch(base,/new URL\([^\n]*import\.meta\.url/,'audio-base unexpectedly owns import.meta.url asset depth');

const importers=[];
for(const entry of fs.readdirSync('src',{withFileTypes:true})){
  if(!entry.isFile()||!entry.name.endsWith('.js'))continue;
  const file=`src/${entry.name}`;
  if(file===audioPath||file===basePath)continue;
  const text=read(file);
  if(/['"]\.\/audio\.js['"]/.test(text)||/['"]\.\/audio-base\.js['"]/.test(text))importers.push(file);
}
assert.deepEqual(importers,['src/main.js'],'audio public boundary changed unexpectedly');

const contractFiles=[];
const roots=['qa','.github/workflows'];
for(const root of roots){
  if(!fs.existsSync(root))continue;
  const walk=dir=>{
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      const p=path.join(dir,entry.name);
      if(entry.isDirectory())walk(p);
      else if(/\.(mjs|js|yml|yaml)$/.test(entry.name)){
        const text=fs.readFileSync(p,'utf8');
        if(text.includes('src/audio.js')||text.includes('src/audio-base.js'))contractFiles.push(p.replaceAll('\\','/'));
      }
    }
  };
  walk(root);
}
contractFiles.sort();

console.log('SOURCE TREE AUDIO AUDIT: PASS',JSON.stringify({
  runtimeFiles:[audioPath,basePath],
  publicImporter:'src/main.js',
  dynamicImports:0,
  assetPolicy:'application-relative URLs stay ./assets/audio/... after module move',
  qaCiPathContracts:contractFiles
},null,2));

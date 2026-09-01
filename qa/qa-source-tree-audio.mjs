import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8').replace(/\r\n/g,'\n');
const audioPath='src/audio/audio.js';
const basePath='src/audio/audio-base.js';
const oldRoot=['src/audio.js','src/audio-base.js'];

for(const file of [audioPath,basePath])assert.ok(fs.existsSync(file),`audio source missing: ${file}`);
for(const file of oldRoot)assert.equal(fs.existsSync(file),false,`legacy root audio module returned: ${file}`);

const main=read('src/main.js');
const audio=read(audioPath);
const base=read(basePath);

assert.match(main,/from '\.\/audio\/audio\.js'/,'main must import the moved public audio module');
assert.doesNotMatch(main,/from '\.\/audio\.js'/,'legacy root audio import returned to main');
assert.match(audio,/from '\.\/audio-base\.js'/,'moved audio facade must keep audio-base as sibling');
assert.match(audio,/export \* from '\.\/audio-base\.js'/,'moved audio facade must preserve audio-base exports');
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

const rootImporters=[];
for(const entry of fs.readdirSync('src',{withFileTypes:true})){
  if(!entry.isFile()||!entry.name.endsWith('.js'))continue;
  const file=`src/${entry.name}`;
  const text=read(file);
  if(/['"]\.\/audio\/audio\.js['"]/.test(text))rootImporters.push(file);
}
assert.deepEqual(rootImporters,['src/main.js'],'audio public boundary changed unexpectedly');

const expectedContracts=[
  'qa/V21_29_SKID_AUDIO_CURVE_QA.mjs',
  'qa/V21_29_SKID_AUDIO_LINK_QA.mjs'
];
for(const file of expectedContracts){
  const text=read(file);
  assert.ok(text.includes('src/audio/audio.js'),`audio QA path not retargeted: ${file}`);
  assert.equal(text.includes('../src/audio.js'),false,`legacy audio QA path returned: ${file}`);
}

console.log('SOURCE TREE AUDIO QA: PASS',JSON.stringify({
  runtimeFiles:[audioPath,basePath],
  removedRootFiles:oldRoot,
  publicImporter:'src/main.js',
  dynamicImports:0,
  assetPolicy:'application-relative URLs remain ./assets/audio/... after module move',
  qaPathContracts:expectedContracts
},null,2));

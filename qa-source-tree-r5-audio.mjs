import assert from 'node:assert/strict';
import fs from 'node:fs';

const moved=['src/audio/audio.js','src/audio/audio-base.js'];
const oldRoot=['src/audio.js','src/audio-base.js'];
for(const file of moved)assert.ok(fs.existsSync(file),`R5 moved audio module missing: ${file}`);
for(const file of oldRoot)assert.equal(fs.existsSync(file),false,`R5 old root audio module returned: ${file}`);

const main=fs.readFileSync('src/main.js','utf8');
assert.match(main,/from '\.\/audio\/audio\.js'/,'main must import canonical R5 audio module');
assert.doesNotMatch(main,/from '\.\/audio\.js'/,'legacy root audio import returned to main');

const audio=fs.readFileSync('src/audio/audio.js','utf8');
assert.match(audio,/from '\.\/audio-base\.js'/,'R5 audio wrapper must keep base module as sibling');
assert.match(audio,/export \* from '\.\/audio-base\.js'/,'R5 audio wrapper must preserve base exports');

const curveQa=fs.readFileSync('qa/V21_29_SKID_AUDIO_CURVE_QA.mjs','utf8');
const linkQa=fs.readFileSync('qa/V21_29_SKID_AUDIO_LINK_QA.mjs','utf8');
for(const [name,source] of [['curve',curveQa],['link',linkQa]]){
  assert.match(source,/\.\.\/src\/audio\/audio\.js/,`${name} audio QA must use canonical R5 path`);
  assert.doesNotMatch(source,/\.\.\/src\/audio\.js/,`${name} audio QA still references legacy root path`);
}

console.log('SOURCE TREE R5 AUDIO QA: PASS',{
  moved,
  removedRoot:oldRoot,
  mainImport:'./audio/audio.js'
});

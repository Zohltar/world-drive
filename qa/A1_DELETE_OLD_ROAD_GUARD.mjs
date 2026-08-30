import assert from 'node:assert/strict';
import {existsSync,readdirSync,readFileSync,statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const oldPath=path.join(ROOT,'src/road-geometry-v21.31.js');
assert.equal(existsSync(oldPath),true,'audit branch still expects old module before final deletion');

function walk(dir){
  const out=[];
  for(const ent of readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,ent.name);
    if(ent.isDirectory())out.push(...walk(p));
    else if(ent.isFile())out.push(p);
  }
  return out;
}
const refs=[];
for(const file of walk(path.join(ROOT,'qa'))){
  if(!/\.(?:js|mjs|cjs)$/.test(file))continue;
  const text=readFileSync(file,'utf8');
  if(text.includes('road-geometry-v21.31.js'))refs.push(path.relative(ROOT,file).replaceAll('\\','/'));
}
assert.deepEqual(refs,[],'no QA should import the obsolete road module after A1 migration');
console.log('A1 OLD ROAD MODULE RETIREMENT GUARD: PASS');

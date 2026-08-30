import assert from 'node:assert/strict';
import {existsSync,readdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const candidates=[
  {path:'src/forest-runtime-data/forest-pack-00.js',tokens:['forest-pack-00','forest-runtime-data']},
  {path:'src/forest-terrain-sampler.js',tokens:['forest-terrain-sampler','createForestTerrainSampler']},
  {path:'src/pine-tree-runtime.js',tokens:['pine-tree-runtime','buildPineTreeAsset','pine_tree_01']},
  {path:'src/road-metadata.js',tokens:['road-metadata','createRoadMetadataService']}
];
const roots=['src','qa','server','electron','.github'].map(p=>path.join(ROOT,p)).filter(existsSync);
const rootFiles=['package.json','forge.config.cjs','index.html'].map(p=>path.join(ROOT,p)).filter(existsSync);
function walk(dir){
  const out=[];
  for(const ent of readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,ent.name);
    if(ent.isDirectory())out.push(...walk(p)); else if(ent.isFile())out.push(p);
  }
  return out;
}
const files=[...roots.flatMap(walk),...rootFiles].filter(f=>{
  const rel=path.relative(ROOT,f).replaceAll('\\','/');
  if(rel==='qa/a4-orphan-reference-scan.mjs')return false;
  return /\.(?:js|mjs|cjs|json|yml|yaml|html|css|md)$/.test(f);
});
const results=[];
for(const candidate of candidates){
  assert.ok(existsSync(path.join(ROOT,candidate.path)),`${candidate.path} missing before A4`);
  const hits=[];
  for(const f of files){
    const rel=path.relative(ROOT,f).replaceAll('\\','/');
    if(rel===candidate.path)continue;
    let text='';try{text=readFileSync(f,'utf8');}catch{continue;}
    const matched=candidate.tokens.filter(token=>text.includes(token));
    if(matched.length)hits.push({file:rel,tokens:matched});
  }
  results.push({candidate:candidate.path,hits});
}
const dynamicImports=[];
for(const f of files){
  let text='';try{text=readFileSync(f,'utf8');}catch{continue;}
  const rel=path.relative(ROOT,f).replaceAll('\\','/');
  text.split(/\r?\n/).forEach((line,i)=>{
    if(/import\s*\(/.test(line)||/require\s*\([^'"`]/.test(line))dynamicImports.push({file:rel,line:i+1,text:line.trim().slice(0,220)});
  });
}
console.log('A4 ORPHAN REFERENCE SCAN',JSON.stringify({results,dynamicImports},null,2));
for(const r of results)assert.deepEqual(r.hits,[],`${r.candidate} still has code/tool references`);
const suspicious=dynamicImports.filter(x=>/(forest|pine|road|metadata|pack)/i.test(x.text));
assert.deepEqual(suspicious,[],'possible convention-based dynamic loader could reference A4 candidates');
console.log('A4 ORPHAN REFERENCE SCAN: PASS');

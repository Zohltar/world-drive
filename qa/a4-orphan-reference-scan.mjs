import assert from 'node:assert/strict';
import {existsSync,readdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const candidates=[
  {path:'src/forest-runtime-data/forest-pack-00.js',fileNames:['forest-pack-00.js'],symbols:[]},
  {path:'src/forest-terrain-sampler.js',fileNames:['forest-terrain-sampler.js'],symbols:['createForestTerrainSampler']},
  {path:'src/pine-tree-runtime.js',fileNames:['pine-tree-runtime.js'],symbols:['buildPineTreeAsset']},
  {path:'src/road-metadata.js',fileNames:['road-metadata.js'],symbols:['createRoadMetadataService']}
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
  return /\.(?:js|mjs|cjs|json|yml|yaml|html|css)$/.test(f);
});
function escapeRe(value){return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
const results=[];
for(const candidate of candidates){
  assert.ok(existsSync(path.join(ROOT,candidate.path)),`${candidate.path} missing before A4`);
  const hits=[];
  for(const f of files){
    const rel=path.relative(ROOT,f).replaceAll('\\','/');
    if(rel===candidate.path)continue;
    let text='';try{text=readFileSync(f,'utf8');}catch{continue;}
    const matched=[];
    for(const name of candidate.fileNames){
      if(new RegExp(`['\"\\x60][^'\"\\x60]*${escapeRe(name)}[^'\"\\x60]*['\"\\x60]`).test(text))matched.push(`file:${name}`);
    }
    for(const symbol of candidate.symbols){
      if(new RegExp(`\\b${escapeRe(symbol)}\\b`).test(text))matched.push(`symbol:${symbol}`);
    }
    if(matched.length)hits.push({file:rel,matched});
  }
  results.push({candidate:candidate.path,hits});
}

// Only inspect actual application/build code for convention-based dynamic loads.
// QA's pathToFileURL() cache-busting imports are unrelated to runtime ownership.
const runtimeFiles=files.filter(f=>{
  const rel=path.relative(ROOT,f).replaceAll('\\','/');
  return rel.startsWith('src/')||rel.startsWith('server/')||rel.startsWith('electron/')||rel.startsWith('.github/')||['package.json','forge.config.cjs','index.html'].includes(rel);
});
const dynamicImports=[];
for(const f of runtimeFiles){
  let text='';try{text=readFileSync(f,'utf8');}catch{continue;}
  const rel=path.relative(ROOT,f).replaceAll('\\','/');
  text.split(/\r?\n/).forEach((line,i)=>{
    if(/import\s*\(/.test(line)||/require\s*\([^'\"`]/.test(line))dynamicImports.push({file:rel,line:i+1,text:line.trim().slice(0,220)});
  });
}
console.log('A4 ORPHAN REFERENCE SCAN',JSON.stringify({results,dynamicImports},null,2));
for(const r of results)assert.deepEqual(r.hits,[],`${r.candidate} still has exact code/tool references`);
const suspicious=dynamicImports.filter(x=>/(forest-pack|forest-runtime-data|forest-terrain-sampler\.js|pine-tree-runtime|road-metadata)/i.test(x.text));
assert.deepEqual(suspicious,[],'possible convention-based dynamic loader could reference A4 candidates');
console.log('A4 ORPHAN REFERENCE SCAN: PASS');

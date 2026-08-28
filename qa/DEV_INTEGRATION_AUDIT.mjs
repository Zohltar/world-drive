import assert from 'node:assert/strict';
import {readdirSync,readFileSync,statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const SRC=path.join(ROOT,'src');

function walk(dir){
  const out=[];
  for(const entry of readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())out.push(...walk(full));
    else if(entry.isFile()&&/\.(?:js|mjs|cjs)$/.test(entry.name))out.push(full);
  }
  return out;
}

function rel(file){return path.relative(ROOT,file).replaceAll('\\','/');}
function localSpecs(source){
  const specs=[];
  const patterns=[
    /(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  ];
  for(const regex of patterns){
    let match;
    while((match=regex.exec(source)))if(match[1]?.startsWith('.'))specs.push(match[1]);
  }
  return specs;
}
function resolveLocal(from,spec){
  const base=path.resolve(path.dirname(from),spec);
  const candidates=[base,`${base}.js`,`${base}.mjs`,`${base}.cjs`,path.join(base,'index.js')];
  return candidates.find(candidate=>{
    try{return statSync(candidate).isFile();}catch{return false;}
  })||null;
}

const files=walk(SRC);
const fileSet=new Set(files);
const graph=new Map();
const unresolved=[];
for(const file of files){
  const source=readFileSync(file,'utf8');
  const deps=[];
  for(const spec of localSpecs(source)){
    const resolved=resolveLocal(file,spec);
    if(resolved&&fileSet.has(resolved))deps.push(resolved);
    else if(!resolved)unresolved.push({from:rel(file),spec});
  }
  graph.set(file,[...new Set(deps)]);
}

const entrypoints=[path.join(SRC,'main.js')].filter(fileSet.has.bind(fileSet));
const reachable=new Set();
const queue=[...entrypoints];
while(queue.length){
  const file=queue.pop();
  if(reachable.has(file))continue;
  reachable.add(file);
  for(const dep of graph.get(file)||[])queue.push(dep);
}

const multiplayerFiles=files.filter(file=>path.basename(file).startsWith('multiplayer-')||path.basename(file)==='multiplayer.js');
const multiplayerOrphans=multiplayerFiles.filter(file=>!reachable.has(file)).map(rel).sort();
const multiplayerReachable=multiplayerFiles.filter(file=>reachable.has(file)).map(rel).sort();

const historicalPattern=/(?:-m\d+(?:\d+)?|-v18|-v2)\.js$/i;
const historicalReachable=multiplayerReachable.filter(file=>historicalPattern.test(file));

const globals=[];
for(const file of files){
  const source=readFileSync(file,'utf8');
  const names=[...source.matchAll(/(?:globalThis|window)\.(__WORLD_DRIVE_[A-Z0-9_]+__)/g)].map(m=>m[1]);
  if(names.length)globals.push({file:rel(file),names:[...new Set(names)]});
}

const suspiciousNumberNull=[];
for(const file of files){
  const source=readFileSync(file,'utf8');
  if(!/(multiplayer|transmission)/i.test(file))continue;
  const lines=source.split(/\r?\n/);
  for(let i=0;i<lines.length;i++){
    if(/Number\([^)]*(?:gear|selector)[^)]*\)/i.test(lines[i])&&!/(null|undefined|present|Number\.isFinite)/i.test(lines.slice(Math.max(0,i-2),i+2).join(' '))){
      suspiciousNumberNull.push({file:rel(file),line:i+1,text:lines[i].trim().slice(0,180)});
    }
  }
}

assert.ok(entrypoints.length,'src/main.js missing');
assert.equal(unresolved.filter(item=>reachable.has(path.join(ROOT,item.from))).length,0,'reachable runtime has unresolved relative imports');

console.log('DEV INTEGRATION IMPORT AUDIT',JSON.stringify({
  srcFiles:files.length,
  runtimeReachable:reachable.size,
  multiplayerReachable,
  multiplayerOrphans,
  historicalReachable,
  debugGlobals:globals,
  suspiciousNumberNull
},null,2));

import assert from 'node:assert/strict';
import {readdirSync,readFileSync,statSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const SRC=path.join(ROOT,'src');

function walk(dir,{extensions=null,filter=null}={}){
  const out=[];
  if(!existsSync(dir))return out;
  for(const entry of readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())out.push(...walk(full,{extensions,filter}));
    else if(entry.isFile()){
      if(extensions&&!extensions.some(ext=>entry.name.endsWith(ext)))continue;
      if(filter&&!filter(full))continue;
      out.push(full);
    }
  }
  return out;
}

function rel(file){return path.relative(ROOT,file).replaceAll('\\','/');}
function localSpecs(source){
  const specs=[];
  const patterns=[
    {kind:'static',regex:/(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g},
    {kind:'dynamic',regex:/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g}
  ];
  for(const {kind,regex} of patterns){
    let match;
    while((match=regex.exec(source)))if(match[1]?.startsWith('.'))specs.push({spec:match[1],kind});
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

const files=walk(SRC,{extensions:['.js','.mjs','.cjs']});
const fileSet=new Set(files);
const graph=new Map();
const unresolved=[];
const dynamicImports=[];
for(const file of files){
  const source=readFileSync(file,'utf8');
  const deps=[];
  for(const item of localSpecs(source)){
    const resolved=resolveLocal(file,item.spec);
    if(item.kind==='dynamic')dynamicImports.push({from:rel(file),spec:item.spec,resolved:resolved?rel(resolved):null});
    if(resolved&&fileSet.has(resolved))deps.push(resolved);
    else if(!resolved)unresolved.push({from:rel(file),spec:item.spec,kind:item.kind});
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

const historicalPattern=/(?:-m\d+(?:\d+)?|-v18|-v2|-p\d+)\.js$/i;
const historicalReachable=[...reachable].map(rel).filter(file=>historicalPattern.test(file)).sort();

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

// R1 — source-root organization inventory.
const rootSourceFiles=readdirSync(SRC,{withFileTypes:true})
  .filter(entry=>entry.isFile()&&/\.(?:js|mjs|cjs|css)$/.test(entry.name))
  .map(entry=>`src/${entry.name}`)
  .sort();
const rootJs=rootSourceFiles.filter(file=>/\.(?:js|mjs|cjs)$/.test(file));
const cssFiles=walk(SRC,{extensions:['.css']}).map(rel).sort();

function ownershipBucket(file){
  const name=path.basename(file);
  if(name==='main.js')return 'entrypoint';
  if(file.startsWith('src/physics/'))return 'physics';

  if(['application-settings.js','loaded-settings-application.js','diagnostics.js','version.js'].includes(name))return 'app';
  if(['keyboard-controls.js','gamepad.js'].includes(name))return 'input';
  if(['startup-ui.js','v21-menu.js','instrument-cluster.js','minimap.js','heading-compass.js','route-planner-ui.js'].includes(name))return 'ui';
  if(['routing.js','routing-service.js','route-lifecycle.js','route-presets.js','route-challenge.js','geocoding.js'].includes(name))return 'routing';
  if(['cache.js','overpass.js','desktop-overpass-transport.js'].includes(name))return 'services';
  if(['audio.js','audio-base.js'].includes(name))return 'audio';

  if(name.startsWith('civil-traffic'))return 'traffic';
  if(name==='multiplayer.js'||name.startsWith('multiplayer-'))return 'multiplayer';

  if(
    name.startsWith('vehicle-dynamics')||
    name.startsWith('driving-runtime')||
    name.startsWith('transmission-')||
    name==='wheel-ground-support.js'||
    name==='skidmarks.js'
  )return 'physics-runtime';

  if(['camera.js','autopilot-controller.js','environment-controller.js'].includes(name))return 'driving-control';

  if(
    name.startsWith('vehicle-')||
    name==='deferred-glb-system.js'||
    /^(countach|id4|wrx|civic|sonata|f1|i3)-glb\.js$/.test(name)||
    name==='truck-trailer.js'
  )return 'vehicles';

  if(name==='road-geometry.js'||name.startsWith('road-furniture')||name==='signs.js'||name==='bridges.js')return 'world-road';
  if(name.startsWith('terrain')||['elevation.js','sky-lighting.js','world-materials.js','world-scene.js'].includes(name))return 'world-terrain';
  if(name.startsWith('imagery'))return 'world-imagery';
  if(name.startsWith('scenery-')||name.startsWith('forest-')||name==='frame-runtime-profiler.js')return 'world-scenery-forest';
  if(name.startsWith('water-'))return 'world-water';
  if(name.startsWith('local-world-builder')||name.startsWith('streaming-coordinator')||name==='world-streaming.js')return 'world-streaming';

  return null;
}

const ownership={};
const unclassifiedRoot=[];
for(const file of rootJs){
  const bucket=ownershipBucket(file);
  if(!bucket)unclassifiedRoot.push(file);
  else (ownership[bucket]??=[]).push(file);
}

// R1 — explicit path contracts outside production source. These need migration
// whenever a module moves even if runtime imports are otherwise correct.
const contractCandidates=[
  ...walk(path.join(ROOT,'qa'),{extensions:['.mjs','.js']}),
  ...walk(ROOT,{filter:file=>/^qa-.*\.mjs$/i.test(path.basename(file))}),
  ...walk(path.join(ROOT,'.github','workflows'),{extensions:['.yml','.yaml']}),
  ...walk(path.join(ROOT,'electron'),{extensions:['.js','.cjs','.mjs']}),
  path.join(ROOT,'index.html'),
  path.join(ROOT,'forge.config.cjs'),
  path.join(ROOT,'package.json')
].filter(existsSync);
const uniqueContracts=[...new Set(contractCandidates)];
const sourcePathPattern=/(?:\.\.\/|\.\/)?src\/[A-Za-z0-9_./-]+\.(?:js|css)/g;
const pathContracts=[];
for(const file of uniqueContracts){
  const source=readFileSync(file,'utf8');
  const matches=[...new Set(source.match(sourcePathPattern)||[])].sort();
  if(matches.length)pathContracts.push({file:rel(file),paths:matches});
}

const fanIn=new Map(files.map(file=>[file,0]));
for(const deps of graph.values())for(const dep of deps)fanIn.set(dep,(fanIn.get(dep)||0)+1);
const metrics=files.map(file=>({
  file:rel(file),
  bytes:statSync(file).size,
  fanIn:fanIn.get(file)||0,
  fanOut:(graph.get(file)||[]).length,
  reachable:reachable.has(file)
}));
const topByBytes=[...metrics].sort((a,b)=>b.bytes-a.bytes).slice(0,15);
const topFanIn=[...metrics].sort((a,b)=>b.fanIn-a.fanIn||b.bytes-a.bytes).slice(0,15);
const topFanOut=[...metrics].sort((a,b)=>b.fanOut-a.fanOut||b.bytes-a.bytes).slice(0,15);

assert.ok(entrypoints.length,'src/main.js missing');
assert.equal(unresolved.filter(item=>reachable.has(path.join(ROOT,item.from))).length,0,'reachable runtime has unresolved relative imports');
assert.deepEqual(unclassifiedRoot,[],'R1 ownership map must classify every root JS file');

console.log('DEV INTEGRATION IMPORT / SOURCE TREE AUDIT',JSON.stringify({
  sourceTree:{
    srcCodeFiles:files.length,
    runtimeReachable:reachable.size,
    browserGraphOrphans:files.filter(file=>!reachable.has(file)).map(rel).sort(),
    rootSourceFiles,
    rootJsCount:rootJs.length,
    nestedCodeFiles:files.length-rootJs.length,
    cssFiles,
    ownership,
    unclassifiedRoot,
    dynamicImports,
    pathContracts,
    topByBytes,
    topFanIn,
    topFanOut
  },
  multiplayerReachable,
  multiplayerOrphans,
  historicalReachable,
  debugGlobals:globals,
  suspiciousNumberNull,
  unresolved
},null,2));

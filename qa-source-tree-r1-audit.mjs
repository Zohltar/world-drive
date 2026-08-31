import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const SRC=path.join(ROOT,'src');
const normalize=p=>p.split(path.sep).join('/');

function walk(dir,filter=()=>true){
  const out=[];
  if(!fs.existsSync(dir))return out;
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())out.push(...walk(full,filter));
    else if(filter(full))out.push(full);
  }
  return out;
}

const sourceFiles=walk(SRC,p=>p.endsWith('.js')).map(p=>normalize(path.relative(ROOT,p))).sort();
const sourceSet=new Set(sourceFiles);
const rootJs=sourceFiles.filter(p=>path.dirname(p)==='src');
const nestedJs=sourceFiles.filter(p=>path.dirname(p)!=='src');

function importSpecs(text){
  const specs=[];
  const staticRe=/(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g;
  const dynamicRe=/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while((m=staticRe.exec(text)))specs.push({spec:m[1],kind:'static'});
  while((m=dynamicRe.exec(text)))specs.push({spec:m[1],kind:'dynamic'});
  return specs;
}

function resolveRelative(owner,spec){
  if(!spec.startsWith('.'))return null;
  const base=normalize(path.join(path.dirname(owner),spec));
  const candidates=[base,`${base}.js`,`${base}/index.js`];
  return candidates.find(p=>sourceSet.has(p))||base;
}

const graph=new Map();
const dynamicImports=[];
const unresolved=[];
for(const file of sourceFiles){
  const text=fs.readFileSync(file,'utf8');
  const deps=[];
  for(const item of importSpecs(text)){
    const resolved=resolveRelative(file,item.spec);
    if(item.kind==='dynamic')dynamicImports.push({owner:file,spec:item.spec,resolved});
    if(resolved){
      deps.push(resolved);
      if(!sourceSet.has(resolved))unresolved.push({owner:file,spec:item.spec,resolved});
    }
  }
  graph.set(file,[...new Set(deps)]);
}

const reachable=new Set();
const stack=['src/main.js'];
while(stack.length){
  const current=stack.pop();
  if(reachable.has(current)||!sourceSet.has(current))continue;
  reachable.add(current);
  for(const dep of graph.get(current)||[])if(sourceSet.has(dep))stack.push(dep);
}
const orphans=sourceFiles.filter(p=>!reachable.has(p));

const contractFiles=[
  ...walk(path.join(ROOT,'qa'),p=>/\.(?:mjs|js)$/.test(p)),
  ...walk(ROOT,p=>/^qa-.*\.mjs$/i.test(path.basename(p))),
  ...walk(path.join(ROOT,'.github','workflows'),p=>/\.ya?ml$/i.test(p))
];
const uniqueContracts=[...new Set(contractFiles.map(p=>normalize(path.relative(ROOT,p))))].sort();
const sourcePathRe=/src\/[A-Za-z0-9_./-]+\.js/g;
const pathContracts=[];
for(const file of uniqueContracts){
  const text=fs.readFileSync(file,'utf8');
  const matches=[...new Set(text.match(sourcePathRe)||[])].sort();
  if(matches.length)pathContracts.push({file,paths:matches});
}

function bucket(file){
  const name=path.basename(file);
  if(file.startsWith('src/physics/'))return 'physics';
  if(/^multiplayer-|^multiplayer\.js$/.test(name))return 'multiplayer';
  if(/^civil-traffic/.test(name))return 'traffic';
  if(/^(vehicle-|countach-|id4-|wrx-|civic-|sonata-|f1-|i3-|truck-trailer)/.test(name))return 'vehicles';
  if(/^(terrain|imagery|local-world-builder|streaming-coordinator|world-streaming|world-materials|world-scene|elevation)/.test(name))return 'world';
  if(/^(forest-|scenery-|water-|road-furniture|road-geometry|signs|bridges)/.test(name))return 'scenery-road';
  if(/^(audio|camera|gamepad|keyboard-controls|autopilot-controller|transmission-|driving-runtime|wheel-ground-support|skidmarks)/.test(name))return 'driving';
  if(/^(v21-|instrument-cluster|minimap|heading-compass|route-planner-ui|startup-ui)/.test(name))return 'ui';
  if(/^(routing|route-|geocoding|overpass|cache|application-settings|loaded-settings-application|desktop-overpass-transport|diagnostics|version)/.test(name))return 'services-app';
  return 'other';
}

const buckets={};
for(const file of rootJs){
  const key=bucket(file);
  (buckets[key]??=[]).push(file);
}

const report={
  source:{
    totalJs:sourceFiles.length,
    rootJs:rootJs.length,
    nestedJs:nestedJs.length,
    reachableFromMain:reachable.size,
    browserGraphOrphans:orphans
  },
  imports:{
    unresolvedRelative:unresolved,
    dynamicImports
  },
  pathContracts:{
    filesWithExplicitSrcPaths:pathContracts.length,
    entries:pathContracts
  },
  proposedOwnershipBuckets:buckets
};

console.log('WORLD DRIVE SOURCE TREE R1 AUDIT');
console.log(JSON.stringify(report,null,2));
if(unresolved.length){
  console.error(`R1 FAIL: ${unresolved.length} unresolved relative source imports`);
  process.exit(1);
}
console.log('R1 AUDIT: PASS');

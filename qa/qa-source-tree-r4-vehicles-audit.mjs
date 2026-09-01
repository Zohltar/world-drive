import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const rel=p=>path.relative(ROOT,p).replaceAll('\\','/');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const exists=p=>fs.existsSync(path.join(ROOT,p));

const COMMON=[
  'src/vehicles/vehicle-system.js',
  'src/vehicles/vehicle-visuals.js',
  'src/vehicles/vehicle-presentation.js',
  'src/vehicles/vehicle-presentation-v21.29.js',
  'src/vehicles/vehicle-authored-registry.js',
  'src/vehicles/vehicle-render-contract.js',
  'src/vehicles/vehicle-glb-entries.js',
  'src/vehicles/deferred-glb-system.js',
  'src/vehicles/vehicle-placement-controller.js'
];
const MODELS=[
  'src/vehicles/models/civic-glb.js',
  'src/vehicles/models/countach-glb.js',
  'src/vehicles/models/f1-glb.js',
  'src/vehicles/models/i3-glb.js',
  'src/vehicles/models/id4-glb.js',
  'src/vehicles/models/sonata-glb.js',
  'src/vehicles/models/wrx-glb.js'
];
const TRUCK=['src/vehicles/truck/truck-trailer.js'];
const CANDIDATES=[...COMMON,...MODELS,...TRUCK];
for(const file of CANDIDATES)assert(exists(file),`R4 candidate missing: ${file}`);
assert.equal(CANDIDATES.length,17,'R4 candidate inventory drift');

function walk(dir,out=[]){
  for(const entry of fs.readdirSync(path.join(ROOT,dir),{withFileTypes:true})){
    if(['node_modules','dist','.git'].includes(entry.name))continue;
    const child=path.posix.join(dir,entry.name);
    if(entry.isDirectory())walk(child,out);
    else out.push(child);
  }
  return out;
}

const sourceFiles=walk('src').filter(f=>/\.(?:js|mjs|cjs)$/.test(f));
const contractFiles=[
  ...fs.readdirSync(ROOT).filter(f=>/^qa-.*\.mjs$/.test(f)),
  ...walk('qa').filter(f=>/\.(?:js|mjs|cjs|html)$/.test(f)),
  ...walk('.github/workflows').filter(f=>/\.ya?ml$/.test(f))
];

function importsOf(file){
  const text=read(file);
  const rows=[];
  const patterns=[
    {kind:'static',re:/(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g},
    {kind:'dynamic',re:/import\(\s*['"]([^'"]+)['"]\s*\)/g}
  ];
  for(const {kind,re} of patterns){
    let m;
    while((m=re.exec(text)))rows.push({kind,spec:m[1]});
  }
  return rows;
}
function resolveRelative(from,spec){
  if(!spec.startsWith('.'))return null;
  return rel(path.resolve(ROOT,path.dirname(from),spec));
}

const sourceImports=new Map(sourceFiles.map(file=>[file,importsOf(file)]));
const candidateSet=new Set(CANDIDATES);
const reverse={};
for(const target of CANDIDATES)reverse[target]=[];
for(const [from,imports] of sourceImports){
  for(const item of imports){
    const resolved=resolveRelative(from,item.spec);
    if(resolved&&candidateSet.has(resolved))reverse[resolved].push({from,kind:item.kind,spec:item.spec});
  }
}

const edges={};
for(const file of CANDIDATES){
  edges[file]=sourceImports.get(file).map(item=>({...item,resolved:resolveRelative(file,item.spec)}));
}

const dynamic=[];
const modulePaths=[];
const assetRefs=[];
for(const file of CANDIDATES){
  const text=read(file);
  for(const item of sourceImports.get(file))if(item.kind==='dynamic')dynamic.push({file,spec:item.spec,resolved:resolveRelative(file,item.spec)});
  let m;
  const moduleRe=/modulePath\s*:\s*['"]([^'"]+)['"]/g;
  while((m=moduleRe.exec(text)))modulePaths.push({file,value:m[1]});
  const urlRe=/new\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g;
  while((m=urlRe.exec(text)))assetRefs.push({file,kind:'import.meta.url',value:m[1]});
  const assetLiteralRe=/['"]([^'"]*assets\/[^'"]+)['"]/g;
  while((m=assetLiteralRe.exec(text))){
    if(!assetRefs.some(r=>r.file===file&&r.value===m[1]))assetRefs.push({file,kind:'asset-literal',value:m[1]});
  }
}

const registry=read('src/vehicles/vehicle-authored-registry.js');
const descriptorPairs=[];
const pairRe=/modulePath:'([^']+)'[^\n]*\n?[^]*?loadModule:\(\)=>import\('([^']+)'\)/g;
// Match one descriptor at a time without relying on formatting outside the descriptor body.
const descriptorRe=/(?:^|\n)\s*[A-Za-z0-9_]+:Object\.freeze\(\{([\s\S]*?)\n\s*\}\),?/g;
let descriptorMatch;
while((descriptorMatch=descriptorRe.exec(registry))){
  const body=descriptorMatch[1];
  const mp=body.match(/modulePath:'([^']+)'/);
  const di=body.match(/loadModule:\(\)=>import\('([^']+)'\)/);
  if(mp||di)descriptorPairs.push({modulePath:mp?.[1]||null,dynamicImport:di?.[1]||null});
}
assert.equal(descriptorPairs.length,8,`authored descriptor count drift: ${JSON.stringify(descriptorPairs)}`);
for(const pair of descriptorPairs){
  assert(pair.modulePath&&pair.dynamicImport,`incomplete authored descriptor: ${JSON.stringify(pair)}`);
  const expectedDynamic='./'+path.posix.relative('src/vehicles',pair.modulePath);
  assert.equal(pair.dynamicImport,expectedDynamic,`modulePath/dynamic import mismatch: ${JSON.stringify(pair)}`);
}
assert.equal(dynamic.filter(row=>row.file==='src/vehicles/vehicle-authored-registry.js').length,8,'authored registry dynamic import count drift');
assert.equal(modulePaths.filter(row=>row.file==='src/vehicles/vehicle-authored-registry.js').length,8,'authored registry modulePath count drift');

const glbEntries=read('src/vehicles/vehicle-glb-entries.js');
assert(glbEntries.includes("from '../deferred-glb-system.js'"),'GLB entries/deferred facade boundary drift');
assert(glbEntries.includes("from '../vehicle-authored-registry.js'"),'GLB entries/authored registry boundary drift');
const deferred=read('src/vehicles/deferred-glb-system.js');
assert(deferred.includes("from '../../diagnostics.js'"),'deferred GLB diagnostics boundary drift');
assert(deferred.includes('publishLocalAuthoredPresentationState'),'local authored presentation bridge missing');
const presentation=read('src/vehicles/vehicle-presentation.js');
assert(presentation.includes("from '../vehicle-presentation-v21.29.js'"),'vehicle presentation historical layer boundary drift');
assert(presentation.includes("from '../../vehicle-dynamics.js'"),'vehicle presentation/physics calibration boundary drift');
const presentationLegacy=read('src/vehicles/vehicle-presentation-v21.29.js');
for(const spec of ['../vehicle-dynamics.js','../physics/steering-geometry.js','../physics/airborne-dynamics.js']){
  assert(presentationLegacy.includes(`from '${spec}'`)||presentationLegacy.includes(`from \"${spec}\"`),`presentation physics boundary missing: ${spec}`);
}

const pathContracts=[];
for(const file of contractFiles){
  const text=read(file);
  const hits=CANDIDATES.filter(candidate=>text.includes(candidate)||text.includes('./'+candidate)||text.includes('../'+candidate));
  if(hits.length)pathContracts.push({file,hits});
}

const externalImporters=[];
for(const target of CANDIDATES){
  for(const row of reverse[target])if(!candidateSet.has(row.from))externalImporters.push({target,...row});
}
externalImporters.sort((a,b)=>a.target.localeCompare(b.target)||a.from.localeCompare(b.from));

const multiplayerCrossBoundary=externalImporters.filter(row=>row.from.startsWith('src/multiplayer'));
const physicsCrossBoundary=[
  ...CANDIDATES.flatMap(file=>edges[file].filter(row=>row.resolved?.includes('/physics/')||row.resolved?.includes('vehicle-dynamics')).map(row=>({from:file,...row}))),
  ...externalImporters.filter(row=>row.from.includes('driving-runtime')||row.from.includes('vehicle-dynamics')||row.from.includes('/physics/'))
];

const report={
  candidates:{common:COMMON,models:MODELS,truck:TRUCK,total:CANDIDATES.length},
  bytes:Object.fromEntries(CANDIDATES.map(file=>[file,fs.statSync(path.join(ROOT,file)).size])),
  reverseImporters:reverse,
  candidateImports:edges,
  externalImporters,
  multiplayerCrossBoundary,
  physicsCrossBoundary,
  dynamicImports:dynamic,
  modulePaths,
  authoredDescriptorPairs:descriptorPairs,
  assetRefs,
  qaCiPathContracts:pathContracts,
  placementController:{
    importers:reverse['src/vehicles/vehicle-placement-controller.js'],
    imports:edges['src/vehicles/vehicle-placement-controller.js'],
    note:'R4 scope locked: vehicle placement belongs under src/vehicles/'
  }
};

console.log('SOURCE TREE R4 VEHICLE AUDIT: PASS');
console.log(JSON.stringify(report,null,2));

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const norm=p=>p.replaceAll('\\','/');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8').replace(/\r\n/g,'\n');

function walk(dir,predicate=()=>true){
  const out=[];
  if(!fs.existsSync(dir))return out;
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,entry.name);
    if(entry.isDirectory())out.push(...walk(p,predicate));
    else if(predicate(p))out.push(norm(p));
  }
  return out;
}

const srcFiles=walk('src',p=>p.endsWith('.js'));
const rootFiles=srcFiles.filter(p=>path.posix.dirname(p)==='src');
const candidatePattern=/^src\/(?:vehicle-dynamics(?:-[^/]+)?|driving-runtime(?:-[^/]+)?|transmission-[^/]+|wheel-ground-support|skidmarks)\.js$/;
const candidates=rootFiles.filter(p=>candidatePattern.test(p)).sort();
const nestedPhysics=srcFiles.filter(p=>p.startsWith('src/physics/')).sort();

const required=[
  'src/vehicle-dynamics.js',
  'src/vehicle-dynamics-core.js',
  'src/vehicle-dynamics-traction-steering.js',
  'src/driving-runtime.js',
  'src/driving-runtime-base.js',
  'src/transmission-controller.js',
  'src/transmission-network-state.js',
  'src/transmission-runtime-bridge.js',
  'src/wheel-ground-support.js',
  'src/skidmarks.js'
];
assert.deepEqual(candidates,required.slice().sort(),'R5 root runtime family changed; re-audit boundary before moving');

const staleHistoricalNames=[
  'src/transmission-controller-base.js',
  'src/vehicle-dynamics-base.js',
  'src/vehicle-dynamics-v21.29.js'
];
for(const p of staleHistoricalNames)assert.equal(fs.existsSync(p),false,`historical path unexpectedly became runtime source: ${p}`);

const importRe=/(?:import\s+(?:[^'";]+?\s+from\s+)?|export\s+[^'";]+?\s+from\s*)['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
function resolveRel(from,spec){
  if(!spec.startsWith('.'))return null;
  const base=norm(path.posix.normalize(path.posix.join(path.posix.dirname(from),spec)));
  for(const p of [base,`${base}.js`,`${base}/index.js`])if(fs.existsSync(p))return p;
  return base;
}
function importsOf(file){
  const text=read(file), out=[];
  for(const m of text.matchAll(importRe)){
    const spec=m[1]||m[2];
    out.push({spec,resolved:resolveRel(file,spec),dynamic:m[0].startsWith('import(')});
  }
  return out;
}

const imports=new Map(srcFiles.map(f=>[f,importsOf(f)]));
const candidateSet=new Set(candidates);
const importers={};
const outbound={};
for(const c of candidates){
  importers[c]=[];
  outbound[c]=imports.get(c).filter(x=>x.resolved).map(x=>x.resolved);
}
for(const [from,edges] of imports){
  for(const edge of edges){
    if(candidateSet.has(edge.resolved))importers[edge.resolved].push(from);
  }
}
for(const c of candidates){
  importers[c].sort();
  outbound[c].sort();
}

const mainImports=candidates.filter(c=>importers[c].includes('src/main.js'));
const crossBoundaryImporters={};
for(const c of candidates){
  const external=importers[c].filter(f=>!candidateSet.has(f));
  if(external.length)crossBoundaryImporters[c]=external;
}

const assetSensitive=[];
const dynamicImports=[];
for(const c of candidates){
  const text=read(c);
  if(/import\.meta\.url|new URL\(|\.\/assets\/|\.\.\/assets\//.test(text))assetSensitive.push(c);
  for(const edge of imports.get(c))if(edge.dynamic)dynamicImports.push({from:c,...edge});
}

const contractNeedles=[...candidates,...staleHistoricalNames];
const contractFiles=[];
for(const root of ['qa','.github/workflows']){
  for(const file of walk(root,p=>/\.(?:mjs|js|yml|yaml)$/.test(p))){
    const text=read(file);
    const hits=contractNeedles.filter(n=>text.includes(n)||text.includes(`../${n}`)||text.includes(`./${n}`));
    if(hits.length)contractFiles.push({file,hits});
  }
}
contractFiles.sort((a,b)=>a.file.localeCompare(b.file));

const publicBoundary=[...new Set(Object.values(crossBoundaryImporters).flat())].sort();
const physicsOutbound=[...new Set(candidates.flatMap(c=>outbound[c]).filter(p=>p.startsWith('src/physics/')))].sort();
const vehicleOutbound=[...new Set(candidates.flatMap(c=>outbound[c]).filter(p=>p.startsWith('src/vehicles/')))].sort();

assert.equal(assetSensitive.length,0,'R5 root candidates unexpectedly own asset-depth-sensitive URLs');
assert.equal(dynamicImports.length,0,'R5 root candidates unexpectedly own dynamic imports');
assert.ok(mainImports.length>=5,'Expected multiple R5 public imports from main.js');
assert.ok(nestedPhysics.length>=8,'Existing src/physics dependency boundary unexpectedly small');

console.log('SOURCE TREE R5 PHYSICS/RUNTIME AUDIT: PASS',JSON.stringify({
  candidates,
  candidateCount:candidates.length,
  nestedPhysics,
  nestedPhysicsCount:nestedPhysics.length,
  mainImports,
  publicBoundary,
  crossBoundaryImporters,
  outbound,
  physicsOutbound,
  vehicleOutbound,
  dynamicImports,
  assetSensitive,
  staleHistoricalNames,
  qaCiPathContractCount:contractFiles.length,
  qaCiPathContracts:contractFiles
},null,2));

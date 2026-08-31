// R2 read-only audit: this push intentionally runs after the workflow exists on the branch.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const SRC=path.join(ROOT,'src');
const norm=p=>p.split(path.sep).join('/');
const rel=p=>norm(path.relative(ROOT,p));

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

const FAMILY=[
  'src/multiplayer.js',
  'src/multiplayer-client-m3.js',
  'src/multiplayer-visuals.js',
  'src/multiplayer-visuals-m3.js',
  'src/multiplayer-visuals-v18.js',
  'src/multiplayer-fallback-visual.js',
  'src/multiplayer-support-math.js',
  'src/multiplayer-vehicle-adapter.js',
  'src/multiplayer-vehicle-registry.js'
];
const familySet=new Set(FAMILY);
for(const file of FAMILY)assert.ok(fs.existsSync(file),`R2 expected multiplayer source missing: ${file}`);

const sourceFiles=walk(SRC,p=>p.endsWith('.js')).map(rel).sort();
const sourceSet=new Set(sourceFiles);

function importSpecs(text){
  const out=[];
  for(const [kind,re] of [
    ['static',/(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g],
    ['dynamic',/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g]
  ]){
    let m;
    while((m=re.exec(text)))out.push({kind,spec:m[1]});
  }
  return out;
}
function resolve(owner,spec){
  if(!spec.startsWith('.'))return null;
  const base=norm(path.join(path.dirname(owner),spec));
  for(const candidate of [base,`${base}.js`,`${base}/index.js`])if(sourceSet.has(candidate))return candidate;
  return base;
}

const inbound=[];
const outbound=[];
const internal=[];
const dynamic=[];
for(const owner of sourceFiles){
  const text=fs.readFileSync(owner,'utf8');
  for(const item of importSpecs(text)){
    const target=resolve(owner,item.spec);
    if(!target)continue;
    const fromFamily=familySet.has(owner);
    const toFamily=familySet.has(target);
    if(item.kind==='dynamic'&&(fromFamily||toFamily))dynamic.push({owner,target,spec:item.spec});
    if(fromFamily&&toFamily)internal.push({owner,target,kind:item.kind,spec:item.spec});
    else if(!fromFamily&&toFamily)inbound.push({owner,target,kind:item.kind,spec:item.spec});
    else if(fromFamily&&!toFamily)outbound.push({owner,target,kind:item.kind,spec:item.spec});
  }
}

const contractFiles=[
  ...walk(path.join(ROOT,'qa'),p=>/\.(?:mjs|js)$/.test(p)),
  ...walk(ROOT,p=>/^qa-.*\.mjs$/i.test(path.basename(p))),
  ...walk(path.join(ROOT,'.github','workflows'),p=>/\.ya?ml$/i.test(p)),
  ...walk(path.join(ROOT,'electron'),p=>/\.(?:js|mjs|cjs)$/.test(p))
].map(rel);
const uniqueContracts=[...new Set(contractFiles)].sort();
const pathContracts=[];
for(const file of uniqueContracts){
  const text=fs.readFileSync(file,'utf8');
  const hits=FAMILY.filter(src=>text.includes(src)||text.includes(`../${src}`)||text.includes(`./${src}`));
  const basenameHits=FAMILY.filter(src=>{
    const name=path.basename(src);
    return !hits.includes(src)&&text.includes(name);
  });
  if(hits.length||basenameHits.length)pathContracts.push({file,exactSourcePaths:hits,basenameMentions:basenameHits});
}

const dynamicM3=dynamic.filter(item=>item.owner==='src/multiplayer-visuals.js'&&item.target==='src/multiplayer-visuals-m3.js');
assert.equal(dynamicM3.length,1,'R2 must preserve one lazy multiplayer-visuals -> multiplayer-visuals-m3 dynamic import');

const directMain=inbound.filter(item=>item.owner==='src/main.js').map(item=>item.target).sort();
assert.ok(directMain.includes('src/multiplayer.js'),'main must import multiplayer public client before R2');
assert.ok(directMain.includes('src/multiplayer-visuals.js'),'main must import multiplayer visual lazy facade before R2');

const report={
  family:FAMILY,
  inbound,
  outbound,
  internal,
  dynamic,
  pathContracts,
  invariants:{
    familyFiles:FAMILY.length,
    inboundEdges:inbound.length,
    outboundEdges:outbound.length,
    internalEdges:internal.length,
    pathContractFiles:pathContracts.length,
    lazyVisualDynamicImport:dynamicM3[0],
    directMain
  }
};

console.log('WORLD DRIVE SOURCE TREE R2 MULTIPLAYER AUDIT');
console.log(JSON.stringify(report,null,2));
console.log('R2 MULTIPLAYER AUDIT: PASS');

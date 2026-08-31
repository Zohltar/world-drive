import fs from 'node:fs';
import path from 'node:path';

const root=path.dirname(new URL(import.meta.url).pathname);
const norm=p=>p.split(path.sep).join('/');
const walk=dir=>{
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())out.push(...walk(full));
    else out.push(full);
  }
  return out;
};
const read=p=>fs.readFileSync(p,'utf8');
const lineRefs=(source,needle)=>source.split(/\r?\n/).flatMap((line,index)=>line.includes(needle)?[{line:index+1,text:line.trim()}]:[]);
const sourceFiles=walk(path.join(root,'src')).filter(p=>/\.(?:js|mjs|cjs)$/.test(p));
const qaFiles=[
  ...fs.readdirSync(root).filter(name=>/^qa.*\.mjs$/.test(name)).map(name=>path.join(root,name)),
  ...walk(path.join(root,'qa')).filter(p=>/\.(?:js|mjs|cjs)$/.test(p))
].filter(p=>path.basename(p)!==path.basename(import.meta.url));

const discovered=new Set();
const globalPattern=/(?:globalThis|window)\.([A-Za-z0-9_$]*ROAD[A-Za-z0-9_$]*SIGN[A-Za-z0-9_$]*)/gi;
for(const file of sourceFiles){
  const source=read(file);let match;
  while((match=globalPattern.exec(source)))discovered.add(match[1]);
}

const expected=['__WORLD_DRIVE_P930_ROAD_SIGNS__','__WORLD_DRIVE_P937_ROAD_SIGNS__'];
for(const name of expected)if(!discovered.has(name))throw new Error(`Expected road-sign diagnostic global missing: ${name}`);
if(discovered.size!==2)throw new Error(`Unexpected road-sign global inventory: ${[...discovered].join(', ')}`);

const inventory={};
for(const name of [...discovered].sort()){
  const sourceRefs=[];
  for(const file of sourceFiles){
    const refs=lineRefs(read(file),name);
    for(const ref of refs)sourceRefs.push({file:norm(path.relative(root,file)),...ref});
  }
  const qaRefs=[];
  for(const file of qaFiles){
    const refs=lineRefs(read(file),name);
    for(const ref of refs)qaRefs.push({file:norm(path.relative(root,file)),...ref});
  }
  const writers=sourceRefs.filter(ref=>new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*=`).test(ref.text));
  const readers=sourceRefs.filter(ref=>!writers.includes(ref));
  inventory[name]={writers,readers,qaRefs};
}

const p930=read(path.join(root,'src','road-furniture-p930.js'));
const p937=read(path.join(root,'src','road-furniture-p937.js'));
if(!/globalThis\.__WORLD_DRIVE_P930_ROAD_SIGNS__\s*=\s*diagnostics/.test(p930))throw new Error('P9.30 diagnostics writer shape changed');
if(!/globalThis\.__WORLD_DRIVE_P937_ROAD_SIGNS__\s*=\s*diagnostics/.test(p937))throw new Error('P9.37 diagnostics writer shape changed');
if(!p937.includes('const baseDiag=base.diagnostics?.()||{};'))throw new Error('P9.37 no longer composes canonical P9.30 diagnostics');
if(!p937.includes('...baseDiag'))throw new Error('P9.37 diagnostics no longer include base diagnostic payload');
if(!p937.includes("mode:'p937-idle-sign-collection'"))throw new Error('P9.37 diagnostics mode changed');
if(!p930.includes("mode:'p930-incremental-sign-build'"))throw new Error('P9.30 diagnostics mode changed');

for(const [name,data] of Object.entries(inventory)){
  if(data.writers.length!==1)throw new Error(`${name} must have exactly one writer; found ${data.writers.length}`);
}

const report={
  discovered:[...discovered].sort(),
  inventory,
  composition:{
    p937WrapsP930:true,
    p930Mode:'p930-incremental-sign-build',
    p937Mode:'p937-idle-sign-collection'
  }
};
console.log('CLEANUP C6.4 ROAD-SIGN DIAGNOSTICS AUDIT: PASS');
console.log(JSON.stringify(report,null,2));

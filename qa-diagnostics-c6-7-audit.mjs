import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
  const p=path.join(dir,e.name);return e.isDirectory()?walk(p):[p];
});
const norm=p=>p.split(path.sep).join('/');
const srcFiles=walk(path.join(root,'src')).filter(p=>/\.(?:js|mjs|cjs)$/.test(p));
const qaFiles=[
  ...fs.readdirSync(root).filter(n=>/^qa.*\.(?:mjs|js|cjs)$/.test(n)).map(n=>path.join(root,n)),
  ...walk(path.join(root,'qa')).filter(p=>/\.(?:js|mjs|cjs)$/.test(p))
].filter(p=>path.basename(p)!==path.basename(import.meta.url));
const read=p=>fs.readFileSync(p,'utf8');
const names=new Set();
const access=/(?:globalThis|window)\.([A-Za-z_$][\w$]*)/g;
for(const file of srcFiles){
  let m;const s=read(file);
  while((m=access.exec(s))){
    const n=m[1];
    if(/^(?:WorldDrive|__WORLD_DRIVE|worldDriveDesktop)/.test(n)&&n!=='WorldDriveDiagnostics')names.add(n);
  }
}

function refs(files,name){
  const out=[];
  for(const file of files){
    const lines=read(file).split(/\r?\n/);
    for(let i=0;i<lines.length;i++)if(lines[i].includes(name))out.push({file:norm(path.relative(root,file)),line:i+1,text:lines[i].trim()});
  }
  return out;
}
function esc(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function category(name){
  if(name==='WorldDriveFramePacing')return 'framePacing';
  if(/FOREST|P928_RECORD_HITCH/.test(name))return 'forest';
  if(/MULTIPLAYER/.test(name))return 'multiplayer';
  if(/Traffic|TRAFFIC/.test(name))return 'traffic';
  if(/Physics|PHYSICS/.test(name))return 'physics';
  if(/P923_LOCAL_WORLD|STREAM/.test(name))return 'streaming';
  if(name==='worldDriveDesktop')return 'desktop';
  return 'other';
}

const inventory={};
for(const name of [...names].sort()){
  const sourceRefs=refs(srcFiles,name);
  const assignRe=new RegExp(`(?:globalThis|window)\\.${esc(name)}\\s*=`);
  const writers=sourceRefs.filter(r=>assignRe.test(r.text));
  const readers=sourceRefs.filter(r=>!writers.includes(r));
  const qaRefs=refs(qaFiles,name);
  inventory[name]={category:category(name),writers,readers,qaRefs};
}
const categories={};
for(const [name,data] of Object.entries(inventory)){
  const c=categories[data.category]??={globals:[],writers:0,readers:0,qaRefs:0,multiOwner:0};
  c.globals.push(name);c.writers+=data.writers.length;c.readers+=data.readers.length;c.qaRefs+=data.qaRefs.length;if(data.writers.length>1)c.multiOwner++;
}
const ranked=Object.entries(categories).map(([category,d])=>({category,count:d.globals.length,writers:d.writers,readers:d.readers,qaRefs:d.qaRefs,multiOwner:d.multiOwner,globals:d.globals})).sort((a,b)=>
  a.multiOwner-b.multiOwner||a.readers-b.readers||a.qaRefs-b.qaRefs||a.count-b.count||a.category.localeCompare(b.category)
);

const forbiddenRemoved=['WorldDriveRuntimeWheelspin','WorldDriveEngineInput','__WORLD_DRIVE_P930_ROAD_SIGNS__','__WORLD_DRIVE_P937_ROAD_SIGNS__','__WORLD_DRIVE_LOCAL_AUTHORED_PRESENTATION__'];
for(const name of forbiddenRemoved)if(names.has(name))throw new Error(`Previously removed independent diagnostic global returned: ${name}`);
if(names.has('WorldDrivePhysicsShadow'))throw new Error('C6.6 DevTools delegate is being counted as an independent direct global access/writer');

console.log('CLEANUP C6.7 REMAINING DIAGNOSTIC GLOBAL AUDIT: PASS');
console.log(JSON.stringify({total:names.size,categories,ranked,inventory},null,2));

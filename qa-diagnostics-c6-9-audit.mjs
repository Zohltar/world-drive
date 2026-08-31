import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);return e.isDirectory()?walk(p):[p];});
const norm=p=>p.split(path.sep).join('/');
const read=p=>fs.readFileSync(p,'utf8');
const srcFiles=walk(path.join(root,'src')).filter(p=>/\.(?:js|mjs|cjs)$/.test(p));
const qaFiles=[
  ...fs.readdirSync(root).filter(n=>/^qa.*\.(?:mjs|js|cjs)$/.test(n)).map(n=>path.join(root,n)),
  ...walk(path.join(root,'qa')).filter(p=>/\.(?:js|mjs|cjs)$/.test(p))
].filter(p=>path.basename(p)!==path.basename(import.meta.url));

const names=new Set();
const access=/(?:globalThis|window)\.([A-Za-z_$][\w$]*)/g;
for(const file of srcFiles){let m;const s=read(file);while((m=access.exec(s))){const n=m[1];if(/^(?:WorldDrive|__WORLD_DRIVE|worldDriveDesktop)/.test(n)&&n!=='WorldDriveDiagnostics')names.add(n);}}

function refs(files,name){const out=[];for(const file of files){const lines=read(file).split(/\r?\n/);for(let i=0;i<lines.length;i++)if(lines[i].includes(name))out.push({file:norm(path.relative(root,file)),line:i+1,text:lines[i].trim()});}return out;}
function esc(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function category(name){
  if(/Traffic|TRAFFIC/.test(name))return 'traffic';
  if(/MULTIPLAYER/.test(name))return 'multiplayer';
  if(/P923_LOCAL_WORLD|STREAM/.test(name))return 'streaming';
  if(/FOREST|P928_RECORD_HITCH/.test(name))return 'forest';
  if(name==='worldDriveDesktop')return 'desktopBridge';
  return 'other';
}

const inventory={};
for(const name of [...names].sort()){
  const sourceRefs=refs(srcFiles,name);
  const writerRe=new RegExp(`(?:globalThis|window)\\.${esc(name)}\\s*=`);
  const writers=sourceRefs.filter(r=>writerRe.test(r.text));
  const readers=sourceRefs.filter(r=>!writers.includes(r));
  const qaRefs=refs(qaFiles,name);
  inventory[name]={category:category(name),writers,readers,qaRefs};
}

for(const removed of ['WorldDriveRuntimeWheelspin','WorldDriveEngineInput','__WORLD_DRIVE_P930_ROAD_SIGNS__','__WORLD_DRIVE_P937_ROAD_SIGNS__','__WORLD_DRIVE_MULTIPLAYER_LOCAL_GEAR__','__WORLD_DRIVE_MULTIPLAYER_WIRE__']){
  if(inventory[removed])throw new Error(`Retired diagnostic surface returned: ${removed}`);
}

const categories={};
for(const [name,d] of Object.entries(inventory)){
  const c=categories[d.category]??={globals:[],writers:0,readers:0,qaRefs:0,multiOwner:0};
  c.globals.push(name);c.writers+=d.writers.length;c.readers+=d.readers.length;c.qaRefs+=d.qaRefs.length;if(d.writers.length>1)c.multiOwner++;
}
const actionable=Object.entries(inventory)
  .filter(([,d])=>d.category!=='desktopBridge')
  .map(([name,d])=>({name,category:d.category,writers:d.writers.length,readers:d.readers.length,qaRefs:d.qaRefs.length,multiOwner:d.writers.length>1}))
  .sort((a,b)=>Number(a.multiOwner)-Number(b.multiOwner)||a.readers-b.readers||a.qaRefs-b.qaRefs||a.writers-b.writers||a.name.localeCompare(b.name));

console.log('CLEANUP C6.9 REMAINING DIAGNOSTIC GLOBAL AUDIT: PASS');
console.log(JSON.stringify({total:names.size,actionableTotal:actionable.length,categories,actionable,inventory},null,2));

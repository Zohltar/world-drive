import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const SKIP=new Set(['.git','node_modules','dist','out','.vite']);
const extensions=new Set(['.js','.mjs','.cjs','.yml','.yaml','.json','.html','.md']);
const refs=[];
const semantic=[];

function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(SKIP.has(entry.name))continue;
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())walk(full);
    else if(extensions.has(path.extname(entry.name))){
      const rel=path.relative(ROOT,full).replaceAll('\\','/');
      if(rel==='qa-transmission-c2-audit.mjs')continue;
      const lines=fs.readFileSync(full,'utf8').split(/\r?\n/);
      lines.forEach((line,index)=>{
        const text=line.trim();
        if(/transmission-controller(?:-base)?\.js|transmission-controller-base|createTransmissionController/.test(text)){
          refs.push({file:rel,line:index+1,text});
        }
        if(/transmissionGear|transmissionPendingGear|publishTransmissionNetworkGear|networkGear|selector|WorldDrive.*Transmission|transmission.*gear/i.test(text)){
          semantic.push({file:rel,line:index+1,text});
        }
      });
    }
  }
}
walk(ROOT);

const base=fs.readFileSync('src/transmission-controller-base.js','utf8');
const wrapper=fs.readFileSync('src/transmission-controller.js','utf8');
const baseFragile=[...base.matchAll(/Number\([^\n]+?\)\|\|1/g)].map(m=>m[0]);
const baseGearWrites=[...base.matchAll(/state\.transmission(?:Pending)?Gear\s*=\s*[^;]+/g)].map(m=>m[0]);
const wrapperGearWrites=[...wrapper.matchAll(/args\.state\.transmission(?:Pending)?Gear\s*=\s*[^;]+/g)].map(m=>m[0]);

const directBaseConsumers=refs.filter(r=>r.file!=='src/transmission-controller-base.js'&&r.text.includes('transmission-controller-base'));
const canonicalConsumers=refs.filter(r=>r.file!=='src/transmission-controller.js'&&/transmission-controller\.js/.test(r.text));
const multiplayer=semantic.filter(r=>/multiplayer|network|peer|serialize|publishTransmissionNetworkGear|transmission-network-state/i.test(`${r.file} ${r.text}`));

console.log('CLEANUP C2 TRANSMISSION OWNERSHIP AUDIT');
console.log(JSON.stringify({
  directBaseConsumers,
  canonicalConsumers,
  baseFragile,
  baseGearWrites,
  wrapperGearWrites,
  multiplayer
},null,2));

if(!directBaseConsumers.some(r=>r.file==='src/transmission-controller.js')){
  throw new Error('Expected canonical wrapper to consume transmission-controller-base.js');
}
if(baseFragile.length===0){
  throw new Error('Expected at least one historical Number(... )||1 forward-gear coercion in base controller');
}

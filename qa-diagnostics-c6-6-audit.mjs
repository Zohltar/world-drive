import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
  const p=path.join(dir,e.name);return e.isDirectory()?walk(p):[p];
});
const norm=p=>p.split(path.sep).join('/');
const read=p=>fs.readFileSync(p,'utf8');
const name='WorldDrivePhysicsShadow';
const srcFiles=walk(path.join(root,'src')).filter(p=>/\.(?:js|mjs|cjs)$/.test(p));
const qaFiles=[
  ...fs.readdirSync(root).filter(n=>/^qa.*\.(?:mjs|js|cjs)$/.test(n)).map(n=>path.join(root,n)),
  ...walk(path.join(root,'qa')).filter(p=>/\.(?:js|mjs|cjs)$/.test(p))
].filter(p=>path.basename(p)!==path.basename(import.meta.url));

function refs(files){
  const out=[];
  for(const file of files){
    const lines=read(file).split(/\r?\n/);
    for(let i=0;i<lines.length;i++)if(lines[i].includes(name)){
      out.push({
        file:norm(path.relative(root,file)),
        line:i+1,
        text:lines[i].trim(),
        context:lines.slice(Math.max(0,i-3),Math.min(lines.length,i+4)).map((text,j)=>({line:Math.max(0,i-3)+j+1,text:text.trim()}))
      });
    }
  }
  return out;
}

const sourceRefs=refs(srcFiles);
const writerRe=/(?:globalThis|window)\.WorldDrivePhysicsShadow\s*=/;
const writers=sourceRefs.filter(r=>writerRe.test(r.text));
const readers=sourceRefs.filter(r=>!writers.includes(r));
const qaRefs=refs(qaFiles);
if(writers.length!==1)throw new Error(`Expected one physics-shadow writer, found ${writers.length}`);
if(readers.length!==0)throw new Error(`Unexpected runtime physics-shadow readers: ${JSON.stringify(readers)}`);
if(qaRefs.length!==1)throw new Error(`Expected one physics-shadow QA/source-string ref, found ${qaRefs.length}`);

const writerFile=path.join(root,writers[0].file);
const writerSource=read(writerFile);
const index=writerSource.indexOf('WorldDrivePhysicsShadow');
const nearby=writerSource.slice(Math.max(0,index-700),Math.min(writerSource.length,index+1200));
const callable=/WorldDrivePhysicsShadow\s*=\s*\(/.test(nearby)||/WorldDrivePhysicsShadow\s*=\s*(?:async\s*)?function/.test(nearby);
const objectAssignment=/WorldDrivePhysicsShadow\s*=\s*\{/.test(nearby);
const assignmentLine=writers[0].text;

console.log('CLEANUP C6.6 PHYSICS SHADOW AUDIT: PASS');
console.log(JSON.stringify({writers,readers,qaRefs,shape:{callable,objectAssignment,assignmentLine},nearby},null,2));

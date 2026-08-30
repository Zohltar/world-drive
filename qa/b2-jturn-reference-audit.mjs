import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const needles=[
  'jTurnTransientYawActive',
  'advanceJTurnTransientYawState',
  'jTurnTransientSteeringSpeed',
  'jTurnTransientLatched',
  'jTurnYawActive'
];
const skip=new Set(['node_modules','.git','dist','out']);
function walk(dir){
  const out=[];
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    if(ent.isDirectory()&&skip.has(ent.name))continue;
    const p=path.join(dir,ent.name);
    if(ent.isDirectory())out.push(...walk(p));
    else if(ent.isFile()&&/\.(?:js|mjs|cjs|yml|yaml)$/.test(ent.name))out.push(p);
  }
  return out;
}
const report={};
for(const needle of needles){
  report[needle]=[];
  for(const file of walk(ROOT)){
    const rel=path.relative(ROOT,file).replaceAll('\\','/');
    if(rel==='qa/b2-jturn-reference-audit.mjs')continue;
    const text=fs.readFileSync(file,'utf8');
    text.split(/\r?\n/).forEach((line,i)=>{
      if(line.includes(needle))report[needle].push({file:rel,line:i+1,text:line.trim().slice(0,220)});
    });
  }
}
console.log('B2 J-TURN REFERENCE AUDIT',JSON.stringify(report,null,2));
if(!report.jTurnTransientYawActive.length)throw new Error('expected legacy entry predicate not found');
if(!report.advanceJTurnTransientYawState.length)throw new Error('latched state helper missing');
console.log('B2 J-TURN REFERENCE AUDIT: PASS');

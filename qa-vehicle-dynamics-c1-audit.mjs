import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const SKIP=new Set(['.git','node_modules','dist','out','.vite']);
const needles=[
  'vehicle-dynamics-v21.29.js',
  'vehicle-dynamics-v21.29',
  'vehicle-dynamics-base.js',
  'vehicle-dynamics-base'
];
const extensions=new Set(['.js','.mjs','.cjs','.md','.yml','.yaml','.json','.html']);
const hits=[];

function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(SKIP.has(entry.name))continue;
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())walk(full);
    else if(extensions.has(path.extname(entry.name))){
      const rel=path.relative(ROOT,full).replaceAll('\\','/');
      if(rel==='qa-vehicle-dynamics-c1-audit.mjs')continue;
      const lines=fs.readFileSync(full,'utf8').split(/\r?\n/);
      lines.forEach((line,index)=>{
        if(needles.some(n=>line.includes(n)))hits.push({file:rel,line:index+1,text:line.trim()});
      });
    }
  }
}
walk(ROOT);
console.log('CLEANUP C1 VEHICLE DYNAMICS LAYER AUDIT');
console.table(hits);
const v29=hits.filter(h=>h.text.includes('vehicle-dynamics-v21.29'));
const base=hits.filter(h=>h.text.includes('vehicle-dynamics-base'));
console.log(JSON.stringify({v29References:v29.length,baseReferences:base.length,v29,base},null,2));

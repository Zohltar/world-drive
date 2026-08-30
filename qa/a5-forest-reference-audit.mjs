import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const targets=[
  'src/forest-chunk-streamer-p912.js',
  'src/forest-chunk-streamer-p928.js',
  'qa-forest-p912-stress.mjs',
  'qa-forest-p928-instrumentation.mjs'
];
const roots=['src','qa','tools','.github','server','electron'].map(p=>path.join(ROOT,p)).filter(fs.existsSync);
const rootFiles=fs.readdirSync(ROOT,{withFileTypes:true})
  .filter(e=>e.isFile()&&/\.(?:js|mjs|cjs|json|yml|yaml|md)$/.test(e.name))
  .map(e=>path.join(ROOT,e.name));
function walk(dir){
  const out=[];
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,ent.name);
    if(ent.isDirectory())out.push(...walk(p));
    else if(ent.isFile()&&/\.(?:js|mjs|cjs|json|yml|yaml|md)$/.test(ent.name))out.push(p);
  }
  return out;
}
const files=[...roots.flatMap(walk),...rootFiles];
const self='qa/a5-forest-reference-audit.mjs';
const reports=[];
for(const target of targets){
  const short=path.basename(target);
  const hits=[];
  for(const file of files){
    const rel=path.relative(ROOT,file).replaceAll('\\','/');
    if(rel===self||rel===target)continue;
    let text='';try{text=fs.readFileSync(file,'utf8');}catch{continue;}
    if(text.includes(target)||text.includes(short)){
      const lines=[];
      text.split(/\r?\n/).forEach((line,i)=>{
        if(line.includes(target)||line.includes(short))lines.push({line:i+1,text:line.trim().slice(0,240)});
      });
      hits.push({file:rel,lines});
    }
  }
  reports.push({target,hits});
}
const entry=fs.readFileSync(path.join(ROOT,'src/forest-chunk-streamer.js'),'utf8');
const wrapper=fs.readFileSync(path.join(ROOT,'src/forest-chunk-streamer-p929-wrapper.js'),'utf8');
const active=fs.readFileSync(path.join(ROOT,'src/forest-chunk-streamer-p929.js'),'utf8');
const activeChain={
  entryToP929Wrapper:entry.includes("./forest-chunk-streamer-p929-wrapper.js"),
  wrapperToP929:wrapper.includes("./forest-chunk-streamer-p929.js"),
  activeImportsP912:active.includes('forest-chunk-streamer-p912'),
  activeImportsP928:active.includes('forest-chunk-streamer-p928'),
  wrapperImportsP912:wrapper.includes('forest-chunk-streamer-p912'),
  wrapperImportsP928:wrapper.includes('forest-chunk-streamer-p928')
};
console.log('A5 FOREST REFERENCE AUDIT',JSON.stringify({activeChain,reports},null,2));
if(!activeChain.entryToP929Wrapper||!activeChain.wrapperToP929)throw new Error('active P9.29 entry chain is not as expected');
if(activeChain.activeImportsP912||activeChain.activeImportsP928||activeChain.wrapperImportsP912||activeChain.wrapperImportsP928){
  throw new Error('active P9.29 path still imports historical P9.12/P9.28 streamer');
}
console.log('A5 FOREST REFERENCE AUDIT: PASS');

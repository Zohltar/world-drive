import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const skip=new Set(['.git','node_modules','dist']);
const refs={base:[],canonical:[]};
function walk(dir='.'){
  for(const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){
    if(skip.has(entry.name))continue;
    const rel=path.join(dir,entry.name).replaceAll('\\','/').replace(/^\.\//,'');
    if(entry.isDirectory()){walk(rel);continue;}
    if(!/\.(?:js|mjs|cjs|yml|yaml|md)$/.test(rel))continue;
    if(rel==='qa-road-geometry-c3-audit.mjs')continue;
    const lines=fs.readFileSync(path.join(root,rel),'utf8').split(/\r?\n/);
    lines.forEach((line,index)=>{
      if(line.includes('road-geometry-base.js'))refs.base.push({file:rel,line:index+1,text:line.trim()});
      if(line.includes('road-geometry.js'))refs.canonical.push({file:rel,line:index+1,text:line.trim()});
    });
  }
}
walk();

const base=fs.readFileSync('src/road-geometry-base.js','utf8');
const canonical=fs.readFileSync('src/road-geometry.js','utf8');
const summary={
  baseReferences:refs.base,
  canonicalReferences:refs.canonical,
  baseLines:base.split(/\r?\n/).length,
  canonicalLines:canonical.split(/\r?\n/).length,
  baseExports:[...base.matchAll(/(?:export\s+)?function\s+(\w+)/g)].map(m=>m[1]),
  canonicalExports:[...canonical.matchAll(/export function\s+(\w+)/g)].map(m=>m[1]),
  canonicalImportsBase:/from '\.\/road-geometry-base\.js'/.test(canonical),
  canonicalWrapsBuildProfile:/buildProfile\(\)\{[\s\S]*base\.buildProfile\(\)[\s\S]*smoothRoadProfileV21_31/.test(canonical)
};
console.log('CLEANUP C3 ROAD GEOMETRY OWNERSHIP AUDIT');
console.log(JSON.stringify(summary,null,2));

if(!summary.canonicalImportsBase)throw new Error('expected current canonical wrapper over base before C3');
if(!summary.canonicalWrapsBuildProfile)throw new Error('current buildProfile smoothing wrapper contract not recognized');

import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const roots=['src','qa'];
const extraFiles=['qa-main-c5-settings.mjs','qa-main-c5-loaded-settings.mjs','qa-forest-active-runtime.mjs','qa-forest-active-stress.mjs','qa-p937-combined-frame-pacing.mjs','qa-p938-forest-retention.mjs','qa-p939-hitch-attribution.mjs','qa-p941-frame-runtime-attribution.mjs','qa-p942-browser-long-frame.mjs'];
const extensions=new Set(['.js','.mjs','.cjs']);

function walk(rel){
  const abs=path.join(root,rel);
  if(!fs.existsSync(abs))return [];
  const stat=fs.statSync(abs);
  if(stat.isFile())return extensions.has(path.extname(abs))?[rel]:[];
  const out=[];
  for(const entry of fs.readdirSync(abs,{withFileTypes:true})){
    const child=path.join(rel,entry.name);
    if(entry.isDirectory())out.push(...walk(child));
    else if(extensions.has(path.extname(entry.name)))out.push(child);
  }
  return out;
}

const files=[...new Set([...roots.flatMap(walk),...extraFiles.filter(file=>fs.existsSync(path.join(root,file)))])].sort();
const sources=new Map(files.map(file=>[file,fs.readFileSync(path.join(root,file),'utf8')]));
const globals=new Map();
const globalPattern=/(?:globalThis|window)\s*(?:\.\s*([A-Za-z_$][\w$]*)|\[\s*['"]([^'"]+)['"]\s*\])/g;

function isQaFile(file){
  return file.startsWith('qa/')||file.startsWith('qa-');
}

function category(name){
  const n=name.toLowerCase();
  if(n.includes('forest'))return 'forest';
  if(n.includes('framepacing')||n.includes('hitch'))return 'framePacing';
  if(n.includes('physics')||n.includes('grip')||n.includes('yaw')||n.includes('tire'))return 'physics';
  if(n.includes('traffic'))return 'traffic';
  if(n.includes('multiplayer'))return 'multiplayer';
  if(n.includes('wheelspin'))return 'wheelspin';
  if(n.includes('stream')||n.includes('local_world')||n.includes('localworld'))return 'streaming';
  if(n.includes('road_sign')||n.includes('roadsign'))return 'roadSigns';
  if(n.includes('presentation')||n.includes('authored'))return 'presentation';
  return 'other';
}

function relation(source,start,end){
  const after=source.slice(end,end+160);
  const before=source.slice(Math.max(0,start-32),start);
  if(/^\s*(?:\?\?=|\|\|=|&&=|\+=|-=|\*=|\/=|=(?!=|>))/.test(after))return 'write';
  if(/^\s*(?:\.\s*[A-Za-z_$][\w$]*|\[[^\]]+\])(?:[\s\S]{0,90}?)(?:\?\?=|\|\|=|&&=|\+=|-=|\*=|\/=|=(?!=|>))/.test(after))return 'mutation';
  if(/delete\s*$/.test(before))return 'delete';
  return 'read';
}

for(const [file,source] of sources){
  let match;
  globalPattern.lastIndex=0;
  while((match=globalPattern.exec(source))){
    const name=match[1]||match[2];
    if(!/(?:WORLD_DRIVE|WorldDrive)/i.test(name))continue;
    const rel=relation(source,match.index,globalPattern.lastIndex);
    const line=source.slice(0,match.index).split('\n').length;
    let item=globals.get(name);
    if(!item){
      item={name,category:category(name),occurrences:[],srcWriters:new Set(),srcReaders:new Set(),qaReaders:new Set(),qaWriters:new Set()};
      globals.set(name,item);
    }
    item.occurrences.push({file,line,relation:rel});
    const isWrite=rel==='write'||rel==='mutation'||rel==='delete';
    if(isQaFile(file)){
      (isWrite?item.qaWriters:item.qaReaders).add(file);
    }else{
      (isWrite?item.srcWriters:item.srcReaders).add(file);
    }
  }
}

const rows=[...globals.values()].map(item=>{
  const qaMentions=[];
  const srcMentions=[];
  for(const [file,source] of sources){
    if(!source.includes(item.name))continue;
    (isQaFile(file)?qaMentions:srcMentions).push(file);
  }
  return {
    name:item.name,
    category:item.category,
    occurrences:item.occurrences.length,
    srcWriters:[...item.srcWriters].sort(),
    srcReaders:[...item.srcReaders].sort(),
    qaReaders:[...item.qaReaders].sort(),
    qaWriters:[...item.qaWriters].sort(),
    srcMentions:[...new Set(srcMentions)].sort(),
    qaMentions:[...new Set(qaMentions)].sort(),
    sourceOwnerCount:item.srcWriters.size,
    directQaConsumerCount:new Set([...item.qaReaders,...item.qaWriters]).size,
    qaMentionCount:new Set(qaMentions).size,
    versionAlias:/P\d{3,4}|V\d+/i.test(item.name)
  };
}).sort((a,b)=>a.category.localeCompare(b.category)||b.qaMentionCount-a.qaMentionCount||a.name.localeCompare(b.name));

const byCategory={};
for(const row of rows){
  const bucket=byCategory[row.category]??={globals:0,aliases:0,qaConsumers:new Set(),sourceWriters:new Set()};
  bucket.globals++;
  if(row.versionAlias)bucket.aliases++;
  row.qaMentions.forEach(v=>bucket.qaConsumers.add(v));
  row.srcWriters.forEach(v=>bucket.sourceWriters.add(v));
}
for(const value of Object.values(byCategory)){
  value.qaConsumers=[...value.qaConsumers].sort();
  value.sourceWriters=[...value.sourceWriters].sort();
}

const multiOwner=rows.filter(row=>row.sourceOwnerCount>1);
const qaPinnedAliases=rows.filter(row=>row.versionAlias&&row.qaMentionCount>0);
const noQaMentions=rows.filter(row=>row.qaMentionCount===0);
const readWithoutWriter=rows.filter(row=>row.srcWriters.length===0&&row.qaWriters.length===0);
const sourceStringOnlyQa=rows.filter(row=>row.qaMentionCount>row.directQaConsumerCount);

console.log('CLEANUP C6 DIAGNOSTIC GLOBAL AUDIT V2');
console.log(JSON.stringify({
  filesScanned:files.length,
  totalGlobals:rows.length,
  categories:byCategory,
  multiOwner:multiOwner.map(({name,category,srcWriters,qaMentionCount})=>({name,category,srcWriters,qaMentionCount})),
  qaPinnedAliases:qaPinnedAliases.map(({name,category,srcWriters,qaMentions})=>({name,category,srcWriters,qaMentions})),
  sourceStringOnlyQa:sourceStringOnlyQa.map(({name,category,directQaConsumerCount,qaMentions})=>({name,category,directQaConsumerCount,qaMentions})),
  noQaMentions:noQaMentions.map(({name,category,srcWriters,srcReaders})=>({name,category,srcWriters,srcReaders})),
  readWithoutWriter:readWithoutWriter.map(({name,category,srcReaders,qaMentions})=>({name,category,srcReaders,qaMentions})),
  globals:rows
},null,2));

if(rows.length<10)throw new Error(`diagnostic audit found suspiciously few globals: ${rows.length}`);
if(!rows.some(row=>row.category==='forest'))throw new Error('forest diagnostics unexpectedly absent');
if(!rows.some(row=>row.category==='multiplayer'))throw new Error('multiplayer diagnostics unexpectedly absent');
if(!sourceStringOnlyQa.length)throw new Error('expected source-string QA diagnostic references were not detected');

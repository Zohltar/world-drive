import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const extensions=new Set(['.js','.mjs','.cjs']);
const remainingCategories=new Set(['physics','traffic','multiplayer','wheelspin','streaming','roadSigns','presentation','other']);

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

const rootQa=fs.readdirSync(root,{withFileTypes:true})
  .filter(entry=>entry.isFile()&&/^qa-.*\.mjs$/.test(entry.name))
  .map(entry=>entry.name);
const files=[...new Set([...walk('src'),...walk('qa'),...rootQa])].sort();
const sources=new Map(files.map(file=>[file,fs.readFileSync(path.join(root,file),'utf8')]));
const globals=new Map();
const globalPattern=/(?:globalThis|window)\s*(?:\.\s*([A-Za-z_$][\w$]*)|\[\s*['"]([^'"]+)['"]\s*\])/g;

function isQaFile(file){return file.startsWith('qa/')||file.startsWith('qa-');}
function category(name){
  const n=name.toLowerCase();
  if(n==='worlddrivediagnostics')return 'canonicalRoot';
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
  const after=source.slice(end,end+180);
  const before=source.slice(Math.max(0,start-40),start);
  if(/^\s*(?:\?\?=|\|\|=|&&=|\+=|-=|\*=|\/=|=(?!=|>))/.test(after))return 'write';
  if(/^\s*(?:\.\s*[A-Za-z_$][\w$]*|\[[^\]]+\])(?:[\s\S]{0,110}?)(?:\?\?=|\|\|=|&&=|\+=|-=|\*=|\/=|=(?!=|>))/.test(after))return 'mutation';
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
    const write=rel==='write'||rel==='mutation'||rel==='delete';
    if(isQaFile(file))(write?item.qaWriters:item.qaReaders).add(file);
    else (write?item.srcWriters:item.srcReaders).add(file);
  }
}

const rows=[...globals.values()].map(item=>{
  const qaMentions=[],srcMentions=[];
  for(const [file,source] of sources){
    if(!source.includes(item.name))continue;
    (isQaFile(file)?qaMentions:srcMentions).push(file);
  }
  const directQa=new Set([...item.qaReaders,...item.qaWriters]);
  const row={
    name:item.name,
    category:item.category,
    srcWriters:[...item.srcWriters].sort(),
    srcReaders:[...item.srcReaders].sort(),
    qaDirect:[...directQa].sort(),
    qaMentions:[...new Set(qaMentions)].sort(),
    srcMentions:[...new Set(srcMentions)].sort(),
    versionAlias:/P\d{3,4}|V\d+/i.test(item.name),
    sourceOwnerCount:item.srcWriters.size,
    textualOnlyQaCount:Math.max(0,new Set(qaMentions).size-directQa.size)
  };
  row.riskScore=
    Math.max(0,row.sourceOwnerCount-1)*20+
    row.srcReaders.length*5+
    row.qaMentions.length*4+
    row.textualOnlyQaCount*3+
    (row.versionAlias?4:0)+
    (row.sourceOwnerCount===0?8:0);
  return row;
});

const remaining=rows.filter(row=>remainingCategories.has(row.category));
const categorySummary={};
for(const row of remaining){
  const bucket=categorySummary[row.category]??={globals:0,writers:new Set(),readers:new Set(),qa:new Set(),versionAliases:0,multiOwner:0,riskScore:0};
  bucket.globals++;
  row.srcWriters.forEach(v=>bucket.writers.add(v));
  row.srcReaders.forEach(v=>bucket.readers.add(v));
  row.qaMentions.forEach(v=>bucket.qa.add(v));
  if(row.versionAlias)bucket.versionAliases++;
  if(row.sourceOwnerCount>1)bucket.multiOwner++;
  bucket.riskScore+=row.riskScore;
}
for(const bucket of Object.values(categorySummary)){
  bucket.writers=[...bucket.writers].sort();
  bucket.readers=[...bucket.readers].sort();
  bucket.qa=[...bucket.qa].sort();
}

const ranking=Object.entries(categorySummary)
  .map(([category,data])=>({category,...data}))
  .sort((a,b)=>a.riskScore-b.riskScore||a.globals-b.globals||a.category.localeCompare(b.category));
const rankedGlobals=remaining.slice().sort((a,b)=>a.riskScore-b.riskScore||a.name.localeCompare(b.name));

console.log('CLEANUP C6.2 REMAINING DIAGNOSTIC AUDIT');
console.log(JSON.stringify({
  filesScanned:files.length,
  currentGlobalCount:rows.length,
  canonicalized:{
    framePacing:rows.filter(r=>r.category==='framePacing').map(r=>r.name),
    forest:rows.filter(r=>r.category==='forest').map(r=>r.name),
    canonicalRoot:rows.filter(r=>r.category==='canonicalRoot').map(r=>r.name)
  },
  ranking,
  rankedGlobals,
  multiOwner:remaining.filter(r=>r.sourceOwnerCount>1),
  versionedQaContracts:remaining.filter(r=>r.versionAlias&&r.qaMentions.length),
  sourceStringQaContracts:remaining.filter(r=>r.textualOnlyQaCount>0)
},null,2));

if(!rows.some(row=>row.name==='WorldDriveDiagnostics'))throw new Error('C6.1 canonical diagnostics root missing');
if(!remaining.length)throw new Error('no remaining diagnostic globals found');
if(!ranking.length)throw new Error('remaining diagnostic category ranking empty');

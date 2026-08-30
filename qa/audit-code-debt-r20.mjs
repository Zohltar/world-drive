import {readdirSync,readFileSync,statSync,existsSync} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const SOURCE_DIRS=['src','server','electron'].map(p=>path.join(ROOT,p)).filter(existsSync);
const JS_RE=/\.(?:js|mjs|cjs)$/;
function walk(dir){
  const out=[];
  for(const ent of readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,ent.name);
    if(ent.isDirectory())out.push(...walk(p));
    else if(ent.isFile()&&JS_RE.test(ent.name))out.push(p);
  }
  return out;
}
function rel(p){return path.relative(ROOT,p).replaceAll('\\','/');}
const files=SOURCE_DIRS.flatMap(walk);
const fileSet=new Set(files);
const source=new Map(files.map(f=>[f,readFileSync(f,'utf8')]));

function specs(src){
  const out=[];
  for(const re of [/(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g,/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g]){
    let m; while((m=re.exec(src)))out.push(m[1]);
  }
  return out;
}
function resolveLocal(from,spec){
  if(!spec.startsWith('.'))return null;
  const base=path.resolve(path.dirname(from),spec);
  for(const c of [base,`${base}.js`,`${base}.mjs`,`${base}.cjs`,path.join(base,'index.js')]){
    try{if(statSync(c).isFile())return c;}catch{}
  }
  return null;
}
const graph=new Map();
const incoming=new Map(files.map(f=>[f,[]]));
const unresolved=[];
for(const f of files){
  const deps=[];
  for(const spec of specs(source.get(f))){
    const r=resolveLocal(f,spec);
    if(r&&fileSet.has(r)){deps.push(r);incoming.get(r).push(f);} else if(spec.startsWith('.')&&!r)unresolved.push({from:rel(f),spec});
  }
  graph.set(f,[...new Set(deps)]);
}
function reachableFrom(entries){
  const seen=new Set(),q=entries.filter(f=>fileSet.has(f));
  while(q.length){const f=q.pop();if(seen.has(f))continue;seen.add(f);for(const d of graph.get(f)||[])q.push(d);}
  return seen;
}
const browserEntry=path.join(ROOT,'src/main.js');
const electronEntry=path.join(ROOT,'electron/main.cjs');
const serverEntry=path.join(ROOT,'server/multiplayer-server.mjs');
const browserReach=reachableFrom([browserEntry]);
const allReach=reachableFrom([browserEntry,electronEntry,serverEntry]);
const srcFiles=files.filter(f=>rel(f).startsWith('src/'));
const browserOrphanFiles=srcFiles.filter(f=>!browserReach.has(f));
const browserOrphans=browserOrphanFiles.map(rel).sort();
const totalOrphans=files.filter(f=>!allReach.has(f)).map(rel).sort();

// QA-only usage matters: a runtime orphan may still be intentionally retained as
// a regression fixture. Scan both qa/ and root-level qa-*.mjs files before
// recommending deletion.
const qaDir=path.join(ROOT,'qa');
const qaFiles=[
  ...(existsSync(qaDir)?walk(qaDir):[]),
  ...readdirSync(ROOT,{withFileTypes:true})
    .filter(e=>e.isFile()&&/^qa-.*\.(?:mjs|js|cjs)$/i.test(e.name))
    .map(e=>path.join(ROOT,e.name))
];
const qaSource=new Map(qaFiles.map(f=>[f,readFileSync(f,'utf8')]));
const orphanQaRefs=browserOrphanFiles.map(f=>{
  const targetRel=rel(f);
  const base=path.basename(f);
  const stem=base.replace(/\.(?:js|mjs|cjs)$/,'');
  const refs=[];
  for(const [q,s] of qaSource){
    if(s.includes(base)||s.includes(stem)||s.includes(targetRel))refs.push(rel(q));
  }
  return {file:targetRel,qaRefs:[...new Set(refs)].sort()};
});

const facades=[];
for(const f of files){
  const name=path.basename(f);
  if(name.endsWith('-base.js')){
    const wrapper=path.join(path.dirname(f),name.replace('-base.js','.js'));
    if(fileSet.has(wrapper))facades.push({base:rel(f),wrapper:rel(wrapper),baseReachable:browserReach.has(f),wrapperReachable:browserReach.has(wrapper),baseIncoming:(incoming.get(f)||[]).map(rel),wrapperIncoming:(incoming.get(wrapper)||[]).map(rel)});
  }
}

const exportCandidates=[];
for(const f of files){
  const s=source.get(f);
  const names=new Set();
  for(const re of [/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,/export\s+class\s+([A-Za-z_$][\w$]*)/g,/export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g]){
    let m;while((m=re.exec(s)))names.add(m[1]);
  }
  for(const name of names){
    let refs=0;
    const word=new RegExp(`\\b${name.replace(/[$]/g,'\\$&')}\\b`,'g');
    for(const other of files){if(other===f)continue;refs+=(source.get(other).match(word)||[]).length;}
    if(refs===0)exportCandidates.push({file:rel(f),name});
  }
}

const markerRe=/(legacy|historical|compat(?:ibility)?|deprecated|TODO|FIXME|V21\.\d+|Grip R\d+|\bP\d+(?:\.\d+)?\b)/gi;
const hotspots=[];
for(const f of files){
  const s=source.get(f); const lines=s.split(/\r?\n/).length; const markers=s.match(markerRe)||[];
  if(markers.length||lines>700)hotspots.push({file:rel(f),lines,markers:markers.length,legacy:(s.match(/legacy/gi)||[]).length,todo:(s.match(/TODO|FIXME/g)||[]).length});
}
hotspots.sort((a,b)=>(b.markers+b.lines/250)-(a.markers+a.lines/250));

const riskSymbols=['bodyRelativeLongitudinalSpeed','bodyRelativeSteeringSpeed','postSpinSteeringAuthority','jTurnTransientYawActive','advanceJTurnTransientYawState','jTurnTransientSteeringSpeed','driftKinematicCoupling','legacyGripYawAcceleration','shouldCanonicalizeMomentumHeading','lowSpeedNoSlip','forceDominatedDrift','dynamicYawRate','velocityHeading','rearHandbrakeSlipState'];
const riskSymbolMap={};
for(const sym of riskSymbols){
  const hits=[]; const re=new RegExp(`\\b${sym}\\b`,'g');
  for(const f of srcFiles){const n=(source.get(f).match(re)||[]).length;if(n)hits.push({file:rel(f),count:n});}
  riskSymbolMap[sym]=hits;
}

const globals=[];
for(const f of files){
  const s=source.get(f); const names=new Set();
  for(const m of s.matchAll(/(?:window|globalThis)\.([A-Za-z_$][\w$]*)/g))names.add(m[1]);
  if(names.size)globals.push({file:rel(f),names:[...names].sort()});
}

const hashes=new Map();
for(const f of files){const h=crypto.createHash('sha1').update(source.get(f)).digest('hex');if(!hashes.has(h))hashes.set(h,[]);hashes.get(h).push(rel(f));}
const duplicates=[...hashes.values()].filter(v=>v.length>1);

const rootNames=readdirSync(ROOT,{withFileTypes:true}).filter(e=>e.isFile()).map(e=>e.name);
const rootLegacy=rootNames.filter(n=>/(backup|FIX_VERSION|CLEANUP_|README_PACKAGING_V\d+)/i.test(n)).sort();

const largest=files.map(f=>({file:rel(f),lines:source.get(f).split(/\r?\n/).length,bytes:Buffer.byteLength(source.get(f))})).sort((a,b)=>b.bytes-a.bytes).slice(0,20);
const lowIncoming=srcFiles.filter(f=>browserReach.has(f)&&(incoming.get(f)||[]).length===1).map(f=>({file:rel(f),importedBy:rel(incoming.get(f)[0])})).slice(0,80);

console.log('CODE_DEBT_AUDIT_R20 '+JSON.stringify({
  counts:{allSourceFiles:files.length,srcFiles:srcFiles.length,browserReachable:browserReach.size,browserOrphans:browserOrphans.length,totalOrphans:totalOrphans.length,unusedExportCandidates:exportCandidates.length,qaFiles:qaFiles.length},
  browserOrphans,totalOrphans,orphanQaRefs,unresolved,facades,unusedExportCandidates:exportCandidates.slice(0,120),hotspots:hotspots.slice(0,30),riskSymbolMap,globals,duplicates,rootLegacy,largest,lowIncoming
},null,2));

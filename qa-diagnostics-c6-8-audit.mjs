import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
  const p=path.join(dir,e.name);return e.isDirectory()?walk(p):[p];
});
const norm=p=>p.split(path.sep).join('/');
const read=p=>fs.readFileSync(p,'utf8');
const name='__WORLD_DRIVE_MULTIPLAYER_WIRE__';
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
      out.push({file:norm(path.relative(root,file)),line:i+1,text:lines[i].trim()});
    }
  }
  return out;
}

const sourceRefs=refs(srcFiles);
const writers=sourceRefs.filter(r=>new RegExp(`(?:globalThis|window)\\.${name}\\s*=`).test(r.text));
const readers=sourceRefs.filter(r=>!writers.includes(r));
const qaRefs=refs(qaFiles);
if(writers.length!==1)throw new Error(`Expected exactly one wire diagnostics writer, found ${writers.length}`);
if(readers.length!==0)throw new Error(`Wire diagnostics unexpectedly feeds runtime code: ${JSON.stringify(readers)}`);
const qaFilesWithRefs=[...new Set(qaRefs.map(r=>r.file))].sort();
const expectedQaFiles=['qa-diagnostics-c6-7.mjs','qa/V21_31_MULTIPLAYER_M3_PROTOCOL_QA.mjs'].sort();
if(qaRefs.length!==4||JSON.stringify(qaFilesWithRefs)!==JSON.stringify(expectedQaFiles)){
  throw new Error(`Unexpected wire QA contracts: ${JSON.stringify(qaRefs)}`);
}

const entry=read(path.join(root,'src','multiplayer.js'));
const expectedCallable=/globalThis\.__WORLD_DRIVE_MULTIPLAYER_WIRE__\s*=\s*\(\)\s*=>\s*\(\{[\s\S]*?exactLocalGear:normalizeWireGear\(readTransmissionNetworkGear\(\)\),[\s\S]*?outgoingCount:wireDiagnostics\.outgoingCount,[\s\S]*?incomingCount:wireDiagnostics\.incomingCount,[\s\S]*?outgoing:wireDiagnostics\.outgoing\?\{\.\.\.wireDiagnostics\.outgoing\}:null,[\s\S]*?incoming:wireDiagnostics\.incoming\?JSON\.parse\(JSON\.stringify\(wireDiagnostics\.incoming\)\):null[\s\S]*?\}\)/;
if(!expectedCallable.test(entry))throw new Error('Wire diagnostics callable payload/copy semantics changed');
if(!entry.includes("const wireDiagnostics={outgoingCount:0,incomingCount:0,outgoing:null,incoming:null};"))throw new Error('Wire diagnostics store initialization changed');
if(!/wireDiagnostics\.outgoingCount\+\+;[\s\S]*?wireDiagnostics\.outgoing=\{at:Date\.now\(\),\.\.\.compactWireState\(prepared\)\};/.test(entry))throw new Error('Outgoing diagnostics publication timing changed');
if(!/wireDiagnostics\.incomingCount\+\+;[\s\S]*?message\?\.type==='state'[\s\S]*?wireDiagnostics\.incoming=\{at:Date\.now\(\),\.\.\.compactWireState\(message\)\}/.test(entry))throw new Error('Incoming diagnostics publication timing changed');
if(!entry.includes('prepared=mergeCivilTrafficIntoOutgoingState(prepared);'))throw new Error('Traffic merge ordering changed unexpectedly');
if(!/const upgraded=upgradeLegacyMultiplayerPayload\(raw\);[\s\S]*?consumeCivilTrafficMultiplayerPayload\(upgraded\);[\s\S]*?return recordIncomingPayload\(upgraded\);/.test(entry))throw new Error('Incoming transform ordering changed unexpectedly');

console.log('CLEANUP C6.8 MULTIPLAYER WIRE AUDIT: PASS');
console.log(JSON.stringify({writers,readers,qaRefs,contract:{
  observerOnly:true,
  exactLocalGearLive:true,
  outgoingShallowClone:true,
  incomingDeepClone:true,
  outgoingAfterGearAndTrafficMerge:true,
  incomingAfterLegacyUpgradeAndTrafficConsume:true
}},null,2));

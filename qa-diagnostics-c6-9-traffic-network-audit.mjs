import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);return e.isDirectory()?walk(p):[p];});
const norm=p=>p.split(path.sep).join('/');
const read=p=>fs.readFileSync(p,'utf8');
const name='WorldDriveTrafficNetwork';
const srcFiles=walk(path.join(root,'src')).filter(p=>/\.(?:js|mjs|cjs)$/.test(p));
const qaFiles=[
  ...fs.readdirSync(root).filter(n=>/^qa.*\.(?:mjs|js|cjs)$/.test(n)).map(n=>path.join(root,n)),
  ...walk(path.join(root,'qa')).filter(p=>/\.(?:js|mjs|cjs)$/.test(p))
].filter(p=>!['qa-diagnostics-c6-9-audit.mjs','qa-diagnostics-c6-9-traffic-network-audit.mjs'].includes(path.basename(p)));
function refs(files){const out=[];for(const file of files){const lines=read(file).split(/\r?\n/);for(let i=0;i<lines.length;i++)if(lines[i].includes(name))out.push({file:norm(path.relative(root,file)),line:i+1,text:lines[i].trim()});}return out;}
const sourceRefs=refs(srcFiles);
const writers=sourceRefs.filter(r=>/(?:globalThis|window)\.WorldDriveTrafficNetwork\s*=/.test(r.text));
const readers=sourceRefs.filter(r=>!writers.includes(r));
const qaRefs=refs(qaFiles);
if(writers.length!==1||writers[0].file!=='src/civil-traffic-network-bridge.js')throw new Error(`Unexpected writers: ${JSON.stringify(writers)}`);
if(readers.length!==0)throw new Error(`Unexpected runtime readers: ${JSON.stringify(readers)}`);
if(qaRefs.length!==0)throw new Error(`Unexpected QA refs: ${JSON.stringify(qaRefs)}`);

const source=read(path.join(root,'src','civil-traffic-network-bridge.js'));
const callable=/globalThis\.WorldDriveTrafficNetwork=\(\)=>\{[\s\S]*?const state=readCivilTrafficMultiplayerBridge\(\);[\s\S]*?return \{[\s\S]*?connected:state\.connected,[\s\S]*?ownId:state\.ownId,[\s\S]*?authorityId:state\.authorityId,[\s\S]*?isAuthority:state\.isAuthority,[\s\S]*?peers:state\.peerIds,[\s\S]*?remoteAgents:state\.remoteSnapshot\?\.agents\?\.length\|\|0,[\s\S]*?localAgents:state\.localSnapshot\?\.agents\?\.length\|\|0[\s\S]*?\};[\s\S]*?\};/;
if(!callable.test(source))throw new Error('TrafficNetwork observer payload changed');
if(!source.includes('export function readCivilTrafficMultiplayerBridge()'))throw new Error('Canonical bridge reader missing');
if(!source.includes('export function mergeCivilTrafficIntoOutgoingState(base)'))throw new Error('Outgoing traffic bridge missing');
if(!source.includes('export function consumeCivilTrafficMultiplayerPayload(raw)'))throw new Error('Incoming traffic bridge missing');

console.log('CLEANUP C6.9 TRAFFIC NETWORK DIAGNOSTICS AUDIT: PASS');
console.log(JSON.stringify({writers,readers,qaRefs,payload:['connected','ownId','authorityId','isAuthority','peers','remoteAgents','localAgents'],observerOnly:true},null,2));

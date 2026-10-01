/** Explicit R20 Bolivian Yungas humid-montane launcher. Reuses the accepted
 * finite R15 package and verifies its exact directory before presentation.
 */
export const R20_DIRECTORY_SHA='d40509469325de661a5f060d8e9509819fcc625950fe0d90677b8219977f0f6f';
const path='/local-data/biomes/pilot-r15/';let epoch=0,request=null;
function api(){const a=globalThis.WorldDriveDiagnostics?.forest?.visualPilot;if(!a)throw new Error('Ouvrir le jeu de la candidate à jour et choisir Chuspipata → Yolosa · Yungas.');return a;}
export async function readR20Directory(response,crypto=globalThis.crypto){
  if(!response.ok||!response.body?.getReader)throw new Error('Données R15 manquantes : conserver ou réinstaller le paquet pilot-r15.');
  const reader=response.body.getReader(),parts=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>131072)throw new RangeError('R20 directory size bound');parts.push(value);}}
  finally{await reader.cancel();reader.releaseLock();}
  const data=new Uint8Array(size);let offset=0;for(const p of parts){data.set(p,offset);offset+=p.length;}
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!==R20_DIRECTORY_SHA)throw new Error('Le paquet R15 ne correspond pas aux données Yungas approuvées.');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));
}
export async function start(){
  const target=api(),token=++epoch;request?.abort();const own=new AbortController();request=own;
  const cancel=()=>{if(token===epoch){epoch++;own.abort();}};globalThis.addEventListener?.('pagehide',cancel,{once:true});
  try{
    const directory=await readR20Directory(await fetch(path+'directory.json',{signal:own.signal,cache:'no-store'}));
    if(token!==epoch)return {status:'discarded'};
    return await target.start({profile:'r15-yungas-tropical',directory,baseUrl:new URL(path,globalThis.location.href).href,season:'summer',presentation:'humid-montane-r20'});
  }catch(error){if(token!==epoch)return {status:'discarded'};throw error;}
  finally{if(request===own)request=null;globalThis.removeEventListener?.('pagehide',cancel);}
}
export function stop(){epoch++;request?.abort();request=null;return api().stop();}
export function snapshot(){return {visualPilot:api().snapshot(),framePacing:globalThis.WorldDriveFramePacing?.()??null};}

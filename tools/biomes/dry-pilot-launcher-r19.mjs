/** Explicit R19 Laguna dry-climate launcher. Reuses the accepted finite R14
 * package and verifies its exact directory before changing the presentation.
 */
export const R19_DIRECTORY_SHA='23ece19d72201808d4edb3f904e2dc0ec6dea23f5cdf64f5be341a33ccf73c31';
const path='/local-data/biomes/pilot-r14/';let epoch=0,request=null;
function api(){const a=globalThis.WorldDriveDiagnostics?.forest?.visualPilot;
  if(!a)throw new Error('Ouvrir le jeu de la candidate à jour et choisir Laguna Seca.');return a;}
export async function readR19Directory(response,crypto=globalThis.crypto){
  if(!response.ok||!response.body?.getReader)throw new Error('Données R14 manquantes : conserver ou réinstaller le paquet pilot-r14.');
  const reader=response.body.getReader(),parts=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>131072)throw new RangeError('R19 directory size bound');parts.push(value);}}
  finally{await reader.cancel();reader.releaseLock();}
  const data=new Uint8Array(size);let offset=0;for(const p of parts){data.set(p,offset);offset+=p.length;}
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!==R19_DIRECTORY_SHA)throw new Error('Le paquet R14 ne correspond pas aux données approuvées.');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));
}
export async function start(){
  const target=api(),token=++epoch;request?.abort();const own=new AbortController();request=own;
  const cancel=()=>{if(token===epoch){epoch++;own.abort();}};
  globalThis.addEventListener?.('pagehide',cancel,{once:true});
  try{
    const directory=await readR19Directory(await fetch(path+'directory.json',{signal:own.signal,cache:'no-store'}));
    if(token!==epoch)return {status:'discarded'};
    return await target.start({profile:'r14-laguna-woodland',directory,baseUrl:new URL(path,globalThis.location.href).href,season:'summer',presentation:'dry-r19'});
  }catch(error){if(token!==epoch)return {status:'discarded'};throw error;}
  finally{if(request===own)request=null;globalThis.removeEventListener?.('pagehide',cancel);}
}
export function stop(){epoch++;request?.abort();request=null;return api().stop();}
export function snapshot(){return {visualPilot:api().snapshot(),framePacing:globalThis.WorldDriveFramePacing?.()??null};}

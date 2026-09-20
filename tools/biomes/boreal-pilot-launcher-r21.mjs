/** Explicit R21 Manic ecological boreal launcher. Reuses the accepted finite
 * R13 package and verifies its exact directory before changing presentation.
 */
export const R21_DIRECTORY_SHA='a9cd32f9316c767a6554110c1e795fafef0195fe1ac54c8c84097c42fabe075d';
const path='/local-data/biomes/pilot-r13/';let epoch=0,request=null;
function api(){const a=globalThis.WorldDriveDiagnostics?.forest?.visualPilot;if(!a)throw new Error('Ouvrir le jeu de la candidate à jour et choisir 389 · Manic-2 → Manic-5.');return a;}
export async function readR21Directory(response,crypto=globalThis.crypto){
  if(!response.ok||!response.body?.getReader)throw new Error('Données R13 manquantes : conserver ou réinstaller le paquet pilot-r13.');
  const reader=response.body.getReader(),parts=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>131072)throw new RangeError('R21 directory size bound');parts.push(value);}}
  finally{await reader.cancel();reader.releaseLock();}
  const data=new Uint8Array(size);let offset=0;for(const p of parts){data.set(p,offset);offset+=p.length;}
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!==R21_DIRECTORY_SHA)throw new Error('Le paquet R13 ne correspond pas aux données Manic approuvées.');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));
}
export async function start({season='summer'}={}){
  const target=api(),token=++epoch;request?.abort();const own=new AbortController();request=own;
  const cancel=()=>{if(token===epoch){epoch++;own.abort();}};globalThis.addEventListener?.('pagehide',cancel,{once:true});
  try{
    const directory=await readR21Directory(await fetch(path+'directory.json',{signal:own.signal,cache:'no-store'}));
    if(token!==epoch)return {status:'discarded'};
    return await target.start({profile:'r13-manic-boreal',directory,baseUrl:new URL(path,globalThis.location.href).href,season,presentation:'boreal-diversity-r21'});
  }catch(error){if(token!==epoch)return {status:'discarded'};throw error;}
  finally{if(request===own)request=null;globalThis.removeEventListener?.('pagehide',cancel);}
}
export function stop(){epoch++;request?.abort();request=null;return api().stop();}
export function season(value){return api().season(value);}
export function snapshot(){return {visualPilot:api().snapshot(),framePacing:globalThis.WorldDriveFramePacing?.()??null};}

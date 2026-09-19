/** Explicit R16 launcher; reuses the previously accepted finite R12 data.
 * Import is inert. The directory is pinned by its exact digest, not trusted
 * merely because it came from a local URL. No new worldwide dataset is implied.
 */
export const R16_DIRECTORY_SHA='7432f64a462563351b6c400f35ddda50307f1af109376ac8a76911929a644cf8';
const path='/local-data/biomes/pilot-r12/';let epoch=0,request=null;
function api(){const a=globalThis.WorldDriveDiagnostics?.forest?.visualPilot;
  if(!a)throw new Error('Ouvrir le jeu de la candidate à jour et choisir la Nordschleife, pas la galerie.');return a;}
export async function readR16Directory(response,crypto=globalThis.crypto){
  if(!response.ok||!response.body?.getReader)throw new Error('Données R12 manquantes : conserver ou réinstaller le paquet pilot-r12.');
  const reader=response.body.getReader(),parts=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>131072)throw new RangeError('R16 directory size bound');parts.push(value);}}
  finally{await reader.cancel();reader.releaseLock();}
  const data=new Uint8Array(size);let offset=0;for(const p of parts){data.set(p,offset);offset+=p.length;}
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!==R16_DIRECTORY_SHA)throw new Error('Le paquet R12 ne correspond pas aux données approuvées.');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));
}
export async function start({season='summer'}={}){
  if(season!=='summer'&&season!=='winter')throw new TypeError('Saison requise : summer ou winter');
  const target=api(),token=++epoch;request?.abort();const own=new AbortController();request=own;
  const cancel=()=>{if(token===epoch){epoch++;own.abort();}};
  globalThis.addEventListener?.('pagehide',cancel,{once:true});
  try{
    const directory=await readR16Directory(await fetch(path+'directory.json',{signal:own.signal,cache:'no-store'}));
    if(token!==epoch)return {status:'discarded'};
    return await target.start({directory,baseUrl:new URL(path,globalThis.location.href).href,season,presentation:'mixed-r16'});
  }catch(error){if(token!==epoch)return {status:'discarded'};throw error;}
  finally{if(request===own)request=null;globalThis.removeEventListener?.('pagehide',cancel);}
}
export function stop(){epoch++;request?.abort();request=null;return api().stop();}
export function season(value){return api().season(value);}
export function snapshot(){return {visualPilot:api().snapshot(),framePacing:globalThis.WorldDriveFramePacing?.()??null};}

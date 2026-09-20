/** Explicit R22 Eifel/Nord ecological launcher. Reuses the accepted finite R12
 * package and the accepted R18 roadside understory. Import has no side effects.
 */
import {readR16Directory} from './mixed-pilot-launcher-r16.mjs';
const path='/local-data/biomes/pilot-r12/';let epoch=0,request=null;
function api(){const a=globalThis.WorldDriveDiagnostics?.forest?.visualPilot;if(!a)throw new Error('Ouvrir le jeu de la candidate à jour et choisir la Nordschleife.');return a;}
export async function start({season='summer'}={}){
  if(season!=='summer'&&season!=='winter')throw new TypeError('Saison requise : summer ou winter');
  const target=api(),token=++epoch;request?.abort();const own=new AbortController();request=own;
  const cancel=()=>{if(token===epoch){epoch++;own.abort();}};globalThis.addEventListener?.('pagehide',cancel,{once:true});
  try{
    const directory=await readR16Directory(await fetch(path+'directory.json',{signal:own.signal,cache:'no-store'}));
    if(token!==epoch)return {status:'discarded'};
    return await target.start({profile:'r12-nord-rendered',directory,baseUrl:new URL(path,globalThis.location.href).href,season,presentation:'eifel-temperate-r22',understory:'edge-r18'});
  }catch(error){if(token!==epoch)return {status:'discarded'};throw error;}
  finally{if(request===own)request=null;globalThis.removeEventListener?.('pagehide',cancel);}
}
export function stop(){epoch++;request?.abort();request=null;return api().stop();}
export function season(value){return api().season(value);}
export function snapshot(){return {visualPilot:api().snapshot(),framePacing:globalThis.WorldDriveFramePacing?.()??null};}

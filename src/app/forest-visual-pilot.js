/** Optional R12 port. OFF only retains injected capabilities: no timer, Worker,
 * model construction or I/O. No driving/streaming implementation is replaced.
 */
import {ensureWorldDriveDiagnostics} from './diagnostics.js';
const owners=new WeakMap();
function owner(target){
  let entry=owners.get(target);if(entry)return entry;
  let scene=null,route=null,pilot=null,epoch=0,pending=false,lastError=null;
  const invalidate=()=>{epoch++;pending=false;pilot?.stop();lastError=null;};
  const stop=()=>{invalidate();target.removeEventListener?.('pagehide',stop);};
  async function start(config){
    if(!scene||!route)throw new Error('Charger le jeu avant le pilote visuel');
    const text=JSON.stringify(config);
    if(!text||text.length>2*1024*1024)throw new RangeError('Visual pilot configuration limit');
    const safe=JSON.parse(text);
    const token=++epoch;pending=true;lastError=null;
    target.addEventListener?.('pagehide',stop);
    try{
      const module=await import('../../tools/biomes/rendered-pilot-r12.mjs');
      if(token!==epoch)return {status:'discarded'};
      module.validateR12Config(safe); // Reject bad input before disturbing a working pilot.
      pilot?.stop();
      // Explicit diagnostics and visual presentation must not run duplicate Workers.
      ensureWorldDriveDiagnostics(target).forest.biomes?.stop?.();
      pilot??=module.createRenderedBiomePilot({...scene,...route});
      const result=pilot.start(safe);pending=false;return result;
    }catch(error){
      if(token!==epoch)return {status:'discarded'};
      pending=false;lastError=String(error?.message??error).slice(0,200);
      if(!pilot?.diagnostics().enabled)target.removeEventListener?.('pagehide',stop);
      throw error;
    }
  }
  const api=Object.freeze({start,stop,
    season:value=>{if(!pilot)throw new Error('Démarrer le pilote avant de changer la saison');return pilot.season(value);},
    refresh:()=>pilot?.refresh(),
    snapshot:()=>{const d=pilot?.diagnostics();return {...d,enabled:d?.enabled??false,pending,error:lastError??d?.error??null};},
    audit:()=>pilot?.audit()??{enabled:false,meshes:[]}});
  ensureWorldDriveDiagnostics(target).forest.visualPilot=api;
  entry={invalidate,
    scene(value){stop();pilot=null;scene=value;},
    route(value){stop();pilot=null;route=value;}};
  owners.set(target,entry);return entry;
}
export function registerForestPilotScene(options,target=globalThis){
  if(!target.document)return;
  owner(target).scene({THREE:options.THREE,forestGroup:options.forestGroup});
}
export function registerForestPilotRoute(options,target=globalThis){
  if(!target.document)return Object.freeze({invalidate(){}});
  const value=owner(target);value.route(options);return Object.freeze({invalidate:value.invalidate});
}

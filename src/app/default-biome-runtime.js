/** Default Block 8 biome activation for accepted route pilots.
 * This owner selects only previously validated finite profiles and fails soft when
 * their local source package is unavailable. Unsupported routes keep original R4.
 */
export const DEFAULT_BIOME_MODE='auto-r19';
const PACKAGE_BY_PROFILE=Object.freeze({
  'r12-nord-rendered':'/local-data/biomes/pilot-r12/',
  'r13-manic-boreal':'/local-data/biomes/pilot-r13/',
  'r14-laguna-woodland':'/local-data/biomes/pilot-r14/',
  'r15-yungas-tropical':'/local-data/biomes/pilot-r15/'
});
export function defaultBiomeAutostartEnabled(target=globalThis){
  try{return new URL(target.location.href).searchParams.get('biomes')!=='manual';}
  catch{return true;}
}
export async function resolveDefaultBiomeConfig({route,origin,fetchImpl=globalThis.fetch?.bind(globalThis),baseHref=globalThis.location?.href}={}){
  if(!Array.isArray(route)||route.length<2||!origin||!Number.isFinite(origin.lat)||!Number.isFinite(origin.lon))
    return Object.freeze({status:'unsupported-route',profile:null});
  if(typeof fetchImpl!=='function'||typeof baseHref!=='string')return Object.freeze({status:'data-unavailable',profile:null});
  const [{createBiomeObserverPlan},policy]=await Promise.all([
    import('../scenery/biomes/route-observer-plan.js'),
    import('../../tools/biomes/rendered-pilot-policy-r12.mjs')
  ]);
  const plan=createBiomeObserverPlan(route,{origin,routeId:'default-biome'});
  const ids=[policy.R12_PROFILE,policy.R13_PROFILE,policy.R14_PROFILE,policy.R15_PROFILE];
  let profile=null;
  for(const id of ids){if(policy.renderedRouteMatches(id,plan,origin)){profile=id;break;}}
  if(!profile)return Object.freeze({status:'unsupported-route',profile:null});
  const path=PACKAGE_BY_PROFILE[profile],url=new URL(path+'directory.json',baseHref).href;
  let response;
  try{response=await fetchImpl(url,{cache:'no-store'});}catch{return Object.freeze({status:'data-unavailable',profile,path});}
  if(!response?.ok)return Object.freeze({status:'data-unavailable',profile,path,httpStatus:response?.status??null});
  let directory;
  try{directory=await response.json();}catch{return Object.freeze({status:'data-invalid',profile,path});}
  const config={profile,directory,baseUrl:new URL(path,baseHref).href,season:'summer'};
  if(profile===policy.R12_PROFILE)Object.assign(config,{presentation:'mixed-r16',appearance:'natural-r17',understory:'edge-r18'});
  return Object.freeze({status:'ready',profile,path,config:Object.freeze(config)});
}

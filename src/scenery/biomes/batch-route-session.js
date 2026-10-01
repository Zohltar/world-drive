/** Successive bounded manifest windows, with one active and one staging service.
 * Calls are explicit off-frame work. A single latest pending request replaces old
 * requests; no unbounded queue. No game entrypoint imports this module yet.
 */
import {prepareBiomeService,BIOME_CONTEXT_SCHEMA} from './biome-service.js';
import {BIOME_PROFILES} from './biome-profiles.js';
import {createBiomeRoutePlan} from './route-tile-plan.js';
import {createBiomeRoutePreparer} from './route-preparer.js';
const freeze=Object.freeze;
const result=(status,reason=null,extra={})=>freeze({status,reason,...extra});
export function createBiomeBatchRouteSession({source,transport,maxTiles=8,maxBytes=8*1024*1024}={}) {
  if(typeof source?.resolve!=='function'||typeof transport?.load!=='function'||!Number.isInteger(maxTiles)||maxTiles<1||maxTiles>32
    ||!Number.isInteger(maxBytes)||maxBytes<2048||maxBytes>8*1024*1024)throw new TypeError('Invalid batch session');
  let plan=null,coordinates=null,active=null,staging=null,running=null,pending=null,disposed=false,generation=0,serial=0,last=null;
  const stats={updates:0,handoffs:0,reuses:0,discarded:0,failures:0,peakServices:0,peakResidentArrayBytes:0};
  const valid=r=>!disposed&&r.generation===generation&&r.serial===serial&&!r.controller.signal.aborted;
  function measure(){stats.peakServices=Math.max(stats.peakServices,Number(!!active)+Number(!!staging));
    stats.peakResidentArrayBytes=Math.max(stats.peakResidentArrayBytes,(active?.service.diagnostics().refinement?.residentArrayBytes??0)+(staging?.service.diagnostics().refinement?.residentArrayBytes??0));}
  function cancel(){running?.controller.abort();if(pending){pending.controller.abort();pending.resolve(result('discarded','superseded'));pending=null;}}
  function setRoute(input){
    if(disposed)throw new Error('Batch session disposed');
    const next=createBiomeRoutePlan(input); // validate before changing the good route
    coordinates=input.map(p=>[p[0],p[1]]);plan=next;generation++;serial++;cancel();
    active?.preparer.dispose();active=null;last=null;
    return freeze({generation,totalMeters:plan.totalMeters,pointCount:plan.pointCount});
  }
  async function execute(r){
    const coverage=r.coverage;
    if(coverage.capacityLimited||coverage.planningLimited)return result('limited','route-capacity',{coverage});
    const batch=await source.resolve(coverage.tiles,{signal:r.controller.signal});
    if(!valid(r))return result('discarded','superseded');
    if(batch.status!=='resolved')return result(batch.status,batch.reason,{missing:batch.missing??[],coverage});
    const fingerprints=new Map(batch.manifest.tiles.map(d=>[`${d.x}-${d.y}`,`${d.sha256}/${d.jsonBytes}/${d.gzipBytes}`]));
    const reuse=active&&[...fingerprints].every(([key,value])=>active.fingerprints.get(key)===value);
    let target=active;
    if(!reuse){
      const service=await prepareBiomeService({refinementManifest:batch.manifest,localOptions:{maxTiles,maxBytes}});
      if(!valid(r)){service.dispose();return result('discarded','superseded');}
      const preparer=createBiomeRoutePreparer({service,transport});
      target=staging={service,preparer,fingerprints};preparer.setRoute(coordinates);measure();
    }
    const abort=()=>target.preparer.dispose();
    r.controller.signal.addEventListener('abort',abort,{once:true});
    try {
      if(!valid(r)){abort();return result('discarded','superseded');}
      target.preparer.update(r.position,r.options);
      const readiness=await target.preparer.drain();measure();
      if(!valid(r))return result('discarded','superseded');
      if(!readiness.ready)return result('unavailable','window-not-ready',{readiness});
      if(!reuse){const old=active;active=staging;staging=null;old?.preparer.dispose();stats.handoffs++;}
      else stats.reuses++;
      return result('ready',null,{generation,serial:r.serial,revision:source.revision,readiness});
    } finally {
      r.controller.signal.removeEventListener('abort',abort);
      if(staging===target){staging.preparer.dispose();staging=null;}
      // A superseded reuse may have disposed active; never reuse that instance.
      if(active===target&&target.service.diagnostics().disposed)active=null;
    }
  }
  async function pump(){
    if(running||!pending||disposed)return;
    const r=running=pending;pending=null;
    let answer;
    try{answer=await execute(r);}catch(error){answer=result(valid(r)?'rejected':'discarded',valid(r)?error.message:'superseded');}
    if(!valid(r))answer=result('discarded','superseded');
    if(answer.status==='discarded')stats.discarded++;else if(answer.status!=='ready')stats.failures++;
    if(valid(r))last=answer;
    r.resolve(answer);running=null;void pump();
  }
  function update(position,options={}){
    if(disposed||!plan)throw new Error('No current batch route');
    const bounded={...options,maxTiles:Math.min(options.maxTiles??maxTiles,maxTiles)};
    const coverage=plan.window(position,bounded); // no I/O; rejects bad windows atomically
    serial++;cancel();stats.updates++;
    const promise=new Promise(resolve=>{pending={resolve,position,options:bounded,coverage,generation,serial,controller:new AbortController()};});
    void pump();return promise;
  }
  function query(lat,lon){
    if(active&&!disposed)return active.service.query(lat,lon);
    return freeze({schema:BIOME_CONTEXT_SCHEMA,...BIOME_PROFILES[0],status:'unavailable',reason:disposed?'disposed':'window-not-ready',
      source:null,ecoregion:null,precision:null,confidence:'unavailable',paletteEligible:false,regionalHint:null,
      resolutionDegrees:null,generation,transitionReady:false,boundaryDiagnostic:false,placementAuthority:false,elevationApplied:false});
  }
  function dispose(){if(disposed)return;disposed=true;serial++;cancel();active?.preparer.dispose();staging?.preparer.dispose();active=null;staging=null;coordinates=null;plan=null;source.dispose();transport.dispose();}
  return freeze({setRoute,update,query,dispose,diagnostics:()=>{measure();return {...stats,generation,serial,disposed,pending:pending?1:0,running:running?1:0,
    ready:last?.status==='ready'&&!pending&&!running,last,active:active?.service.diagnostics()??null,staging:staging?.service.diagnostics()??null,
    source:source.diagnostics(),transport:transport.diagnostics(),maxServices:2,maxPendingWindows:1,maxTilesPerService:maxTiles,maxArrayBytesPerService:maxBytes};}});
}

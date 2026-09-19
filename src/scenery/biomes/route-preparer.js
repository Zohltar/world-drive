/** Explicit off-frame route-window preparation. Does not own forest R4 scheduling.
 * One coordinator exclusively owns a prepared service's route lifecycle.
 * No recurring timer, automatic retries, unbounded queue or global fine coverage.
 */
import {createBiomeRoutePlan} from './route-tile-plan.js';
const frozen=Object.freeze;
export function createBiomeRoutePreparer({service,transport,maxConcurrent=2}={}) {
  for(const name of ['beginRoute','requestFor','prepareTile','isTileResident','routeToken','diagnostics']) {
    if(typeof service?.[name]!=='function')throw new TypeError(`Missing service.${name}`);
  }
  if(typeof transport?.load!=='function'||!Number.isInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>4) {
    throw new TypeError('Invalid route preparer transport/concurrency');
  }
  const capacity=service.diagnostics().refinement?.maxTiles??8;
  const concurrency=Math.min(maxConcurrent,service.diagnostics().maxPendingTiles);
  let plan=null,token=null,disposed=false,queue=[],desired=new Map(),coverage=null;
  const active=new Map(),failures=new Map();
  const stats={windows:0,started:0,installed:0,discarded:0,rejected:0,busy:0,peakActive:0,peakQueue:0};
  const alive=()=>!disposed&&token===service.routeToken();
  function pump() {
    if(!alive())return;
    while(queue.length&&active.size<concurrency) {
      queue=queue.filter(d=>!service.isTileResident(d.key)&&!failures.has(d.key)&&desired.has(d.key));
      const index=queue.findIndex(d=>!active.has(d.key));if(index<0)break;
      const [d]=queue.splice(index,1);
      const controller=new AbortController(),jobToken=token;
      const job={controller,token:jobToken,promise:null};
      active.set(d.key,job);stats.started++;stats.peakActive=Math.max(stats.peakActive,active.size);
      job.promise=(async()=> {
        try {
          const loaded=await transport.load(d,{signal:controller.signal});
          if(!alive()||jobToken!==token||controller.signal.aborted||!desired.has(d.key)) {stats.discarded++;return;}
          if(loaded.status!=='loaded') {
            stats[loaded.status==='busy'?'busy':'rejected']++;
            failures.set(d.key,loaded.reason??'transport');return;
          }
          const ready=await service.prepareTile(d.key,loaded.bytes,jobToken,{signal:controller.signal});
          if(ready.status==='installed')stats.installed++;
          else if(ready.status==='discarded')stats.discarded++;
          else {stats[ready.status==='busy'?'busy':'rejected']++;failures.set(d.key,ready.reason);}
        } catch { if(!alive()||controller.signal.aborted)stats.discarded++;
          else {stats.rejected++;failures.set(d.key,'preparation-error');} }
        finally {active.delete(d.key);pump();}
      })();
    }
  }
  function setRoute(coordinates) {
    if(disposed)throw new Error('Route preparer disposed');
    const next=createBiomeRoutePlan(coordinates); // validate before invalidating a good route
    for(const job of active.values())job.controller.abort();
    token=service.beginRoute();plan=next;queue=[];desired=new Map();failures.clear();coverage=null;
    return frozen({totalMeters:plan.totalMeters,pointCount:plan.pointCount});
  }
  function update(positionMeters,options={}) {
    if(!plan||!alive())throw new Error('No current route');
    coverage=plan.window(positionMeters,{...options,maxTiles:Math.min(options.maxTiles??capacity,capacity)});
    const next=new Map();const missing=[];
    for(const tile of coverage.tiles) {
      const d=service.requestFor(90-(tile.y+.5)/10,-180+(tile.x+.5)/10);
      if(d)next.set(tile.key,d);else missing.push(tile.key);
    }
    desired=next;
    // Failed keys are retained only for this bounded corridor. Repeated updates
    // cannot trigger an endless retry storm. retryFailed is a deliberate action.
    for(const key of failures.keys())if(!desired.has(key))failures.delete(key);
    for(const [key,job] of active)if(job.token!==token||!desired.has(key))job.controller.abort();
    queue=[...desired.values()].filter(d=>!service.isTileResident(d.key)&&!failures.has(d.key));
    stats.windows++;stats.peakQueue=Math.max(stats.peakQueue,queue.length);
    coverage=frozen({...coverage,missing:frozen(missing)});
    pump();return diagnostics();
  }
  function diagnostics() {
    const resident=[...desired.keys()].filter(key=>service.isTileResident(key)).length;
    return {...stats,disposed,active:active.size,queued:queue.length,desired:desired.size,resident,
      failures:[...failures].map(([key,reason])=>({key,reason})),coverage,
      ready:!!coverage&&alive()&&!coverage.capacityLimited&&!coverage.planningLimited
        &&coverage.missing.length===0&&resident===desired.size,
      maxConcurrent:concurrency,maxQueued:capacity};
  }
  async function drain() {
    // Explicit test/startup barrier; no hidden recurring work.
    while(active.size||queue.length) {pump();if(!active.size)break;await Promise.all([...active.values()].map(j=>j.promise));}
    return diagnostics();
  }
  function retryFailed() {
    if(!alive())return;failures.clear();queue=[...desired.values()].filter(d=>!service.isTileResident(d.key));pump();
  }
  function dispose() {
    if(disposed)return;disposed=true;queue=[];desired.clear();failures.clear();coverage=null;
    for(const job of active.values())job.controller.abort();
    // Service is exclusively owned, but the transport may be shared with another preparer.
    service.dispose();plan=null;
  }
  return frozen({setRoute,update,drain,retryFailed,dispose,diagnostics});
}

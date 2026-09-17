import {validateChunkRequest} from './chunk-context-snapshot.js';
/** Explicit browser worker client: bounded RPC, no main-thread fallback.
 * Async sample snapshots are not the game's synchronous forest query contract.
 */
export function createBiomeWorkerClient({timeoutMs=30000}={}){
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw new RangeError('Invalid worker deadline');
  const worker=new Worker(new URL('./biome-preparation-worker.js',import.meta.url),{type:'module',credentials:'omit'});
  const pending=new Map();let id=0,closed=false,epoch=0;
  function dispose(reason='Worker disposed'){
    if(closed)return;closed=true;worker.terminate();
    for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error(reason));}pending.clear();
  }
  worker.addEventListener('error',()=>dispose('Worker error'));
  worker.addEventListener('messageerror',()=>dispose('Worker message error'));
  worker.addEventListener('message',({data})=>{
    const p=pending.get(data?.id);if(!p)return;pending.delete(data.id);clearTimeout(p.timer);
    if(p.epoch!==epoch&&(p.op==='sample'||p.op==='chunk')){p.reject(new Error('Stale route sample'));return;}
    if(data.ok)p.resolve(data.value);else p.reject(new Error(data.error));
  });
  function call(op,args){
    if(closed)return Promise.reject(new Error('Worker disposed'));
    if(pending.size>=4)return Promise.reject(new Error('worker-client-admission'));
    const request=++id;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>dispose('Worker deadline exceeded'),timeoutMs);
      pending.set(request,{resolve,reject,timer,op,epoch});
      try{worker.postMessage({id:request,op,args});}catch(e){pending.delete(request);clearTimeout(timer);reject(e);}
    });
  }
  const points=(p,max)=>Array.isArray(p)&&p.length<=max&&p.every(v=>Array.isArray(v)&&v.length===2&&v.every(Number.isFinite)&&Math.abs(v[0])<=180&&Math.abs(v[1])<=90);
  return Object.freeze({
    initialize(config){
      if(!config?.directory||JSON.stringify(config).length>2*1024*1024)return Promise.reject(new Error('Worker initialization size'));
      return call('init',[config]);
    },
    setRoute(coordinates){if(!points(coordinates,20000)||coordinates.length<2)return Promise.reject(new Error('Invalid route'));
      if(closed||pending.size>=4)return Promise.reject(new Error('worker-client-admission'));
      epoch++;return call('route',[coordinates]);},
    update(position,options={}){
      const safe={};for(const key of ['aheadMeters','behindMeters','corridorMeters','maxTiles','maxTests'])if(options[key]!==undefined){if(!Number.isFinite(options[key]))return Promise.reject(new Error('Invalid window option'));safe[key]=options[key];}
      if(!Number.isFinite(position))return Promise.reject(new Error('Invalid position'));return call('update',[position,safe]);},
    captureChunk(request){try{
      validateChunkRequest(request);
      const safe={};for(const k of ['schema','key','requestId','generation','serial','cx','cz','projectionId','layoutId'])safe[k]=request[k];
      safe.points=new Float64Array(request.points);return call('chunk',[safe]);
    }catch(e){return Promise.reject(e);}},
    sample(p){return points(p,256)?call('sample',[p]):Promise.reject(new Error('Invalid sample bound'));},
    diagnostics:()=>call('stats',[]),dispose,
    admission:()=>({pending:pending.size,maxPending:4,closed})});
}

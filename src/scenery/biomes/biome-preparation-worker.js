/** Dedicated module-worker entrypoint. Never imported by the game entrypoint.
 * Fetch, gzip, digest, geometry validation, route planning and queries stay here.
 * RPC is explicit preparation/testing, NOT a per-tree asynchronous render API.
 */
import {createBiomeBatchSource} from './batch-source.js';
import {createBiomeTileTransport} from './tile-transport.js';
import {createBiomeBatchRouteSession} from './batch-route-session.js';
import {captureChunkContext,snapshotIdentity} from './chunk-context-snapshot.js';
let session=null,identity=null,initializing=false,inFlight=0;
self.addEventListener('message',async({data})=>{
  const {id,op,args=[]}=data??{};
  if(!Number.isSafeInteger(id)||id<1)return;
  const reply=(ok,value)=>self.postMessage(ok?{id,ok,value}:{id,ok,error:String(value).slice(0,180)});
  if(inFlight>=4){reply(false,'worker-admission');return;}
  inFlight++;
  try {
    let value;
    if(op==='init'){
      if(session||initializing)throw new Error('Worker already initialized');
      initializing=true;
      let source=null,transport=null;
      try{
        const config=args[0];
        source=await createBiomeBatchSource(config);
        transport=createBiomeTileTransport({baseUrl:config.baseUrl});
        identity=snapshotIdentity(config.directory);
        session=createBiomeBatchRouteSession({source,transport});
        value={worker:true,module:true,compression:typeof DecompressionStream==='function',crypto:!!crypto.subtle};
      }catch(e){source?.dispose();transport?.dispose();throw e;}finally{initializing=false;}
    }else{
      if(!session)throw new Error('Worker not initialized');
      if(op==='route')value=session.setRoute(args[0]);
      else if(op==='update')value=await session.update(args[0],args[1]);
      else if(op==='chunk')value=captureChunkContext(args[0],identity,session);
      else if(op==='sample'){
        const points=args[0];
        if(!Array.isArray(points)||points.length>256||!points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))throw new Error('Invalid sample bound');
        value=points.map(([lon,lat])=>session.query(lat,lon));
      }else if(op==='stats')value=session.diagnostics();
      else throw new Error('Unknown worker command');
    }
    reply(true,value);
  }catch(e){reply(false,e.message);}finally{inFlight--;}
});

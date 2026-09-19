#!/usr/bin/env python3
"""Native Worker + pinned real Manic route, awaited bidirectional replay.
Not a full-game/render/GPU or real-time high-speed test.
"""
import argparse
import functools
import http.server
import json
from pathlib import Path
import shutil
import tempfile
import threading
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]

JS=r'''async ({base,directory,plan,encodedExpected})=>{
  const {createBiomeWorkerClient}=await import('/src/scenery/biomes/biome-worker-client.js');
  const {createBiomeChunkContextBridge}=await import('/src/scenery/biomes/chunk-context-bridge.js');
  const {createForestCandidateAdapter,FOREST_LAYOUT_ID}=await import('/src/scenery/biomes/forest-candidate-adapter.js');
  const must=(v,m)=>{if(!v)throw new Error(m);};
  const originalFetch=globalThis.fetch,originalImul=Math.imul,NativeWorker=Worker;
  let owned=0,terminated=0;
  globalThis.Worker=class extends NativeWorker{constructor(...args){super(...args);owned++;this.ended=false;}
    terminate(){if(!this.ended){this.ended=true;terminated++;}return super.terminate();}};
  globalThis.DecompressionStream=class{constructor(){throw new Error('MAIN_THREAD_GZIP');}};
  crypto.subtle.digest=()=>{throw new Error('MAIN_THREAD_DIGEST');};
  globalThis.fetch=(url,...args)=>{if(/(?:batch-\d+-\d+\.json|\.json\.gz)$/.test(String(url)))throw new Error('MAIN_TILE_IO');return originalFetch(url,...args);};
  const denySampler=()=>{throw new Error('MAIN_FOREST_GENERATION_DURING_PREPARATION');};
  Math.imul=denySampler;
  const c=createBiomeWorkerClient(),a=createForestCandidateAdapter(plan);let calls=0,bridge=null,beatId=null,frames=0;
  const beat=()=>{frames++;beatId=requestAnimationFrame(beat);};beatId=requestAnimationFrame(beat);
  const begun=performance.now();
  try{
    await c.initialize({directory,baseUrl:base});
    bridge=createBiomeChunkContextBridge({client:{...c,captureForestChunk:r=>{must(!('points' in r),'main chunk points');calls++;return c.captureForestChunk(r);}},
      identity:directory,layoutId:FOREST_LAYOUT_ID,maxChunks:16,maxBytes:4*1024*1024});
    must((await bridge.setRoute(plan.coordinates,{projectionId:a.projectionId})).status==='route-ready','real route ready');
    const expected=new Map(Object.entries(encodedExpected).map(([key,v])=>{const raw=Uint8Array.from(atob(v),x=>x.charCodeAt(0));
      must(raw.length===3488,'oracle length');const dv=new DataView(raw.buffer);return [key,Array.from({length:1744},(_,i)=>dv.getUint16(i*2,true))];}));
    let reads=0,resolved=0,noData=0,windowCount=0,last=null,lastPoint=null;
    const visited=new Set(),directionCounts={'1':0,'-1':0},ecoIds=new Set();
    for(const w of plan.windows){
      must((await bridge.update(w.position,w.options)).status==='ready','window '+windowCount+' '+w.position);
      for(const chunk of w.chunks){
        const out=await bridge.prepareForestChunk({cx:chunk.cx,cz:chunk.cz,origin:plan.origin,routeId:plan.routeId});
        must(out.status==='prepared','prepare '+chunk.key+': '+out.reason);
        const want=expected.get(chunk.key);must(want,'source oracle missing');const scratch={};
        // Test-only point generation occurs AFTER preparation, not in the consumer.
        Math.imul=originalImul;
        try{for(let i=0;i<1744;i++){
          a.point(chunk.cx,chunk.cz,i,scratch);const got=out.snapshot.lookup(i,scratch.lon,scratch.lat);
          must(got.status!=='unavailable','unavailable '+chunk.key+' '+i);
          const record=directory.records[want[i]],id=got.ecoregion?.id??null;
          must(id===(record?.id??null),'source mismatch '+chunk.key+' '+i);
          must(got.placementAuthority===false&&Object.isFrozen(got),'placement authority');
          if(id===null)noData++;else{resolved++;ecoIds.add(id);}reads++;
        }
        lastPoint={...a.point(chunk.cx,chunk.cz,0,scratch)};
        }finally{Math.imul=denySampler;}
        last=out.snapshot;visited.add(chunk.key);
      }
      windowCount++;directionCounts[String(w.direction)]++;
    }
    const before=calls,context=last.lookup(0,lastPoint.lon,lastPoint.lat);
    for(let i=0;i<100000;i++)must(last.lookup(0,lastPoint.lon,lastPoint.lat)===context,'synchronous reads');
    must(calls===before,'lookup triggered RPC');
    const stats=bridge.diagnostics(),worker=await c.diagnostics();
    must(windowCount===plan.windows.length&&visited.size===plan.chunks.length,'real plan coverage drift');
    must(stats.evictions>0&&stats.peakChunks<=16&&stats.peakBytes<=4*1024*1024,'resident bounds/eviction');
    must(stats.peakPendingChunks<=2&&stats.peakPendingBytes<=1024*1024&&stats.rejected===0,'pending/rejections');
    must(worker.transport.loaded>0&&worker.transport.rejected===0&&worker.source.verified>=2,'real data/pages');
    must(worker.peakServices<=2&&worker.source.peakCachedPages<=2,'worker budgets');
    // Explicit uncovered road: neither cached chunks nor regional guesses can
    // convert a missing fine-data window into placement authority.
    const other=createForestCandidateAdapter({origin:{lon:0,lat:0},routeId:'outside-pilot'});
    await bridge.setRoute([[0,0],[.01,0]],{projectionId:other.projectionId});
    must(last.lookup(0,lastPoint.lon,lastPoint.lat).status==='unavailable','old view survived route switch');
    must((await bridge.update(0)).status==='unavailable','outside pilot became ready');
    must((await bridge.prepareForestChunk({cx:0,cz:0,origin:other.origin,routeId:other.routeId})).status==='unavailable','outside chunk');
    bridge.dispose();must(owned===1&&terminated===1,'Worker termination');must(frames>0,'UI heartbeat');
    return {status:'PASS',mode:'native-worker-awaited-real-road-replay',routeVertices:plan.pointCount,
      routeMeters:plan.totalMeters,windows:windowCount,directionCounts,uniqueChunks:visited.size,
      uniqueCandidatePositions:visited.size*1744,exactReads:reads,resolved,noData,unavailable:0,mismatches:0,
      ecoregionIds:[...ecoIds].sort((a,b)=>a-b),bridge:stats,worker,captureCalls:calls,
      synchronousReads:100000,uiHeartbeatFrames:frames,ownedWorkers:owned,terminatedWorkers:terminated,
      mainHeavyApisTrapped:true,mainSamplerTrappedDuringPreparation:true,missingCoverageRemainsExplicit:true,
      seconds:(performance.now()-begun)/1000,
      limitations:['Awaited replay, not real-time high-speed readiness or FPS certification',
        'Real router snapshot, not a GPS driving trace; live route may change',
        'Sampled current/forward chunks, not every visible tree or corridor position',
        'Original source polygon agreement, not current field vegetation or planting authority']};
  }finally{if(beatId!==null)cancelAnimationFrame(beatId);Math.imul=originalImul;bridge?.dispose();c.dispose();}
}'''


def run(pilot,output,executable=None):
    pilot=Path(pilot);output=Path(output)
    plan=json.loads((pilot/'route-plan.json').read_text())
    expected=json.loads((pilot/'source-expectations.json').read_text())
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def do_GET(self):
            if self.path=='/__biome-r10__':
                body=b'<!doctype html><meta charset="utf-8"><title>Manic biome QA</title>'
                self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
            else:super().do_GET()
        def log_message(self,*args):pass
    with tempfile.TemporaryDirectory(prefix='biome-r10-browser-',dir=ROOT) as tmp:
        work=Path(tmp);shutil.copytree(pilot/'public/local-data/biomes/pilot-r10',work/'pilot')
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            with sync_playwright() as pw:
                options=dict(headless=True,args=['--no-sandbox'])
                if executable:options['executable_path']=str(executable)
                browser=pw.chromium.launch(**options);page=browser.new_page();errors=[];workers=[]
                page.on('pageerror',lambda e:errors.append(str(e)));page.on('worker',lambda w:workers.append(w.url))
                origin=f'http://127.0.0.1:{server.server_port}';page.goto(origin+'/__biome-r10__')
                report=page.evaluate(JS,dict(base=origin+'/'+work.name+'/pilot/',plan=plan,encodedExpected=expected,
                    directory=json.loads((work/'pilot/directory.json').read_text())))
                assert not errors and len(workers)==1,(errors,workers)
                report.update(browser=browser.version,pageErrors=errors,workerUrls=workers)
                browser.close()
        finally:server.shutdown();server.server_close();thread.join()
    output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:report[k] for k in ['status','routeMeters','windows','uniqueChunks','exactReads','noData','ecoregionIds','seconds']},indent=2))
    return report


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--pilot',required=True,type=Path);p.add_argument('--output',required=True,type=Path)
    p.add_argument('--browser',type=Path,help='Explicit local Chromium executable; CI uses Playwright Chromium')
    a=p.parse_args();run(a.pilot,a.output,a.browser)

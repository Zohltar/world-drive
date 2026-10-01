#!/usr/bin/env python3
"""Native Worker -> immutable chunk snapshot -> synchronous read. Not game FPS.
Uses the unchanged R4 real circuit polygons and source expectations, plus R5
synthetic data for bounded cache/long-progression stress. No new dependencies.
"""
import argparse
import functools
import http.server
import importlib.util
import json
import subprocess
import tempfile
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
JS = r"""async ({base, real, synthetic, routes, expected}) => {
  const {createBiomeWorkerClient}=await import('/src/scenery/biomes/biome-worker-client.js');
  const {createBiomeChunkContextBridge}=await import('/src/scenery/biomes/chunk-context-bridge.js');
  const {createBiomeRoutePlan}=await import('/src/scenery/biomes/route-tile-plan.js');
  const must=(v,m)=>{if(!v)throw new Error(m);};
  globalThis.DecompressionStream=class{constructor(){throw new Error('MAIN_THREAD_GZIP');}};
  crypto.subtle.digest=()=>{throw new Error('MAIN_THREAD_DIGEST');};
  const originalFetch=globalThis.fetch;
  globalThis.fetch=(url,...args)=>{if(/(?:batch-\d+-\d+\.json|\.json\.gz)$/.test(String(url)))throw new Error('MAIN_THREAD_TILE_IO');return originalFetch(url,...args);};
  const bridges=[],clients=[];let captures=0,frames=0,done=false;
  function heartbeat(){frames++;if(!done)requestAnimationFrame(heartbeat);}requestAnimationFrame(heartbeat);
  async function open(directory,path){
    const client=createBiomeWorkerClient();clients.push(client);
    await client.initialize({directory,baseUrl:base+path+'/'});
    const measured={...client,captureChunk:r=>{captures++;return client.captureChunk(r);}};
    const bridge=createBiomeChunkContextBridge({client:measured,identity:directory,layoutId:'r6-native-exact-v1',maxChunks:4,maxBytes:160000});
    bridges.push(bridge);return {client,bridge};
  }
  try {
    const realOwner=await open(real,'real');const b=realOwner.bridge;const realResults=[];
    for(let ri=0;ri<routes.length;ri++){
      const r=routes[ri];await b.setRoute(r.coordinates,{projectionId:'circuit-'+ri});let progress=0;
      for(let i=0;i<r.coordinates.length;i++){
        if(i)progress+=createBiomeRoutePlan([r.coordinates[i-1],r.coordinates[i]]).totalMeters;
        must((await b.update(Math.min(progress,r.totalMeters))).status==='ready','real window');
        const p=r.coordinates[i];const prepared=await b.prepareChunk({cx:i,cz:0,points:[p]});
        must(prepared.status==='prepared','real capture '+prepared.reason);
        const q=b.lookup(i,0,0,p[0],p[1]);must(q.status==='resolved'&&q.ecoregion.id===expected[ri][i],`${r.name}/${i} source mismatch`);
        must(q.placementAuthority===false&&Object.isFrozen(q)&&Object.isFrozen(q.ecoregion),'immutable authority');
        must(b.lookup(i,0,0,p[0]+.00001,p[1]).status==='unavailable','no spatial interpolation');
      }
      realResults.push({name:r.name,positions:r.coordinates.length,mismatches:0});
    }
    const realBridge=b.diagnostics(),realWorker=await realOwner.client.diagnostics();b.dispose();
    const syntheticOwner=await open(synthetic,'synthetic'),s=syntheticOwner.bridge;
    const coords=Array.from({length:150},(_,i)=>[(1800+i+.5)/10-180,-.05]);
    const length=createBiomeRoutePlan(coords).totalMeters;
    await s.setRoute(coords,{projectionId:'synthetic-absolute'});
    let exactPoints=0,last=null,lastPoints=null;
    for(let k=0;k<300;k++){
      const i=k<150?k:299-k;
      must((await s.update(length*i/149,{aheadMeters:1000,behindMeters:0,corridorMeters:0})).status==='ready','synthetic window');
      const points=Array.from({length:1744},(_,j)=>[coords[i][0]+(j%32-16)*.000001,coords[i][1]+(Math.floor(j/32)-27)*.000001]);
      const prepared=await s.prepareChunk({cx:i-75,cz:-3,points});must(prepared.status==='prepared',prepared.reason);
      const snap=prepared.snapshot;
      for(let j=0;j<points.length;j++){
        const q=s.lookup(i-75,-3,j,...points[j]);must(q.ecoregion?.id===i%2+1,'synthetic exact chunk lookup');exactPoints++;
      }
      must(Object.isFrozen(snap),'frozen snapshot');last=snap;lastPoints=points;
    }
    const before=captures;const first=last.lookup(0,...lastPoints[0]);
    for(let i=0;i<100000;i++)must(last.lookup(0,...lastPoints[0])===first,'stable context identity');
    must(captures===before,'synchronous read generated Worker requests');
    const stats=s.diagnostics();must(stats.peakChunks<=4&&stats.peakBytes<=160000&&stats.peakPendingChunks<=2,'snapshot budgets');
    // Old replies must not cross a newer window, even while route identity stays.
    const old=s.prepareChunk({cx:900,cz:0,points:[[...coords[0]]]});
    const next=s.update(0,{aheadMeters:1000,behindMeters:0,corridorMeters:0});
    must((await old).status==='discarded','stale chunk window');await next;
    const oldRoute=s.prepareChunk({cx:901,cz:0,points:[[...coords[0]]]});
    const changed=s.setRoute(coords,{projectionId:'new-projection'});
    must((await oldRoute).status==='discarded','stale chunk route');await changed;
    must(last.lookup(0,...lastPoints[0]).status==='unavailable','old externally retained snapshot remained usable');
    await s.update(0,{aheadMeters:1000,behindMeters:0,corridorMeters:0});
    const fresh=await s.prepareChunk({cx:0,cz:0,points:[coords[0]]});must(fresh.status==='prepared','new route snapshot');
    const syntheticWorker=await syntheticOwner.client.diagnostics();s.dispose();
    must(fresh.snapshot.lookup(0,...coords[0]).status==='unavailable','disposed snapshot');
    must(frames>0,'main page not progressing');
    return {status:'PASS',nativeChunkWorker:true,mainThreadPreparationTraps:true,real:realResults,
      realBridge,realWorker,synthetic:{windows:300,distinctTiles:150,pointsPerChunk:1744,exactPoints,bridge:stats,worker:syntheticWorker},
      repeatedSynchronousReads:100000,captureCalls:captures,uiHeartbeatFrames:frames,
      lifecycle:['stale window','stale route','held snapshot invalidation','disposal','new route recovery'],
      limitations:['No game entrypoint/renderer/GPU workload','Synthetic chunks do not certify actual forest coordinate mapping',
        'Identity/root trusted application input; fine geographic distribution still partial','Payload budgets are not total JS heap limits']};
  } finally {done=true;for(const b of bridges)b.dispose();for(const c of clients)c.dispose();}
}"""

def main(routes, output, executable):
    spec=importlib.util.spec_from_file_location('partition',ROOT/'tools/biomes/partition-refinement-batches.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def do_GET(self):
            if self.path=='/__biome-r6-harness__':
                body=b'<!doctype html><meta charset="utf-8"><title>Biome chunk QA</title>'
                self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
            else:
                super().do_GET()
        def log_message(self,*args):
            pass
    with tempfile.TemporaryDirectory(prefix='biome-r6-',dir=ROOT) as temporary:
        work=Path(temporary)
        packaging=module.build([routes],work/'real','resolve2017-r6-circuits')
        subprocess.run(['node',str(ROOT/'qa/biome-batch-fixtures-r5.mjs'),str(work/'synthetic')],check=True,cwd=ROOT)
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            with sync_playwright() as pw:
                browser=pw.chromium.launch(headless=True,executable_path=executable,args=['--no-sandbox'])
                page=browser.new_page();workers=[];errors=[]
                page.on('worker',lambda w:workers.append(w.url));page.on('pageerror',lambda e:errors.append(str(e)))
                origin=f'http://127.0.0.1:{server.server_port}';page.goto(origin+'/__biome-r6-harness__')
                report=page.evaluate(JS,dict(base=origin+'/'+work.name+'/',
                    real=json.loads((work/'real/directory.json').read_text()),synthetic=json.loads((work/'synthetic/directory.json').read_text()),
                    routes=json.loads((routes/'route-plan.json').read_text())['routes'],expected=json.loads((routes/'route-source-expectations.json').read_text())))
                report.update(browser=browser.version,observedWorkerURLs=workers,packaging=packaging)
                assert len(workers)==2 and not errors, (workers,errors)
                browser.close()
        finally:
            server.shutdown();server.server_close();thread.join()
    output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:report[k] for k in ['status','browser','real','repeatedSynchronousReads','captureCalls','lifecycle']},indent=2))
    print('PASS R6 native Worker exact-point chunk snapshots (not game frame pacing)')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--routes',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--executable',default=None)
    a=p.parse_args();main(a.routes.resolve(),a.output.resolve(),a.executable)

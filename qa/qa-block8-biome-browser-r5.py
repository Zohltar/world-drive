#!/usr/bin/env python3
"""Real Chromium module Worker + HTTP/gzip. Not a game/GPU performance test.
Run after the R4 real-data harness; --routes points to that directory.
Requires build/test-only Playwright, no game package change.
"""
import argparse
import functools
import http.server
import importlib.util
import json
import shutil
import subprocess
import tempfile
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
JS = r"""async ({base, real, synthetic, routes, expected}) => {
  const {createBiomeWorkerClient}=await import('/src/scenery/biomes/biome-worker-client.js');
  const {createBiomeRoutePlan}=await import('/src/scenery/biomes/route-tile-plan.js');
  const must=(v,m)=>{if(!v)throw new Error(m);};
  // Trap any heavy preparation accidentally falling back to the UI thread.
  globalThis.DecompressionStream=class{constructor(){throw new Error('MAIN_THREAD_GZIP');}};
  crypto.subtle.digest=()=>{throw new Error('MAIN_THREAD_DIGEST');};
  const originalFetch=globalThis.fetch;
  globalThis.fetch=(url,...args)=>{if(/(?:batch-\d+-\d+\.json|\.json\.gz)$/.test(String(url)))throw new Error('MAIN_THREAD_TILE_IO');return originalFetch(url,...args);};
  let frames=0,closed=false;function heartbeat(){frames++;if(!closed)requestAnimationFrame(heartbeat);}requestAnimationFrame(heartbeat);
  const clients=[];const summaries=[];
  try {
    const c=createBiomeWorkerClient();clients.push(c);
    const init=await c.initialize({directory:real,baseUrl:base+'real/'});
    must(init.worker&&init.compression&&init.crypto,'native worker capabilities');
    for(let ri=0;ri<routes.length;ri++){
      const r=routes[ri];await c.setRoute(r.coordinates);let progress=0;
      for(let i=0;i<r.coordinates.length;i++){
        if(i)progress+=createBiomeRoutePlan([r.coordinates[i-1],r.coordinates[i]]).totalMeters;
        const ready=await c.update(Math.min(progress,r.totalMeters));must(ready.status==='ready',JSON.stringify(ready));
        const [q]=await c.sample([r.coordinates[i]]);
        must(q.status==='resolved'&&q.ecoregion.id===expected[ri][i],`${r.name}/${i}: source mismatch`);
      }
      summaries.push({name:r.name,points:r.coordinates.length,sourceRecordMismatches:0});
    }
    const realStats=await c.diagnostics();c.dispose();
    const s=createBiomeWorkerClient();clients.push(s);await s.initialize({directory:synthetic,baseUrl:base+'synthetic/'});
    const coords=Array.from({length:150},(_,i)=>[(1800+i+.5)/10-180,-.05]);
    const route=await s.setRoute(coords);
    for(let k=0;k<300;k++){
      const i=k<150?k:299-k;
      const answer=await s.update(route.totalMeters*i/149,{aheadMeters:1000,behindMeters:0,corridorMeters:0});must(answer.status==='ready',JSON.stringify(answer));
      const [q]=await s.sample([coords[i]]);must(q.ecoregion.id===i%2+1,'synthetic context');
    }
    const syntheticStats=await s.diagnostics();
    must(syntheticStats.source.directoryPages===15&&syntheticStats.source.peakCachedPages<=2,'page bounds');
    must(syntheticStats.peakServices===2&&syntheticStats.peakResidentArrayBytes<=16*1024*1024,'service bounds');
    const pending=s.update(route.totalMeters,{aheadMeters:1000,behindMeters:0,corridorMeters:0});
    const changed=s.setRoute(coords.slice(30));
    const newer=s.update(0,{aheadMeters:1000,behindMeters:0,corridorMeters:0});
    await changed;must((await pending).status==='discarded','stale route worker response');must((await newer).status==='ready','new route worker');
    const staleSample=s.sample([coords[30]]);const anotherRoute=s.setRoute(coords.slice(30));
    must((await Promise.allSettled([staleSample]))[0].status==='rejected','stale sample epoch');await anotherRoute;
    const many=await Promise.allSettled(Array.from({length:10},()=>s.diagnostics()));
    must(many.filter(x=>x.status==='rejected').length>=6,'client admission');
    await s.sample(Array.from({length:257},()=>[0,0])).then(()=>{throw new Error('sample bound bypass');},()=>{});
    const kill=s.update(route.totalMeters/2,{aheadMeters:1000,behindMeters:0,corridorMeters:0});s.dispose();
    must((await Promise.allSettled([kill]))[0].status==='rejected','worker termination');
    must(frames>0,'UI heartbeat never ran');
    return {nativeModuleWorker:true,mainThreadPreparationTraps:true,real:summaries,
      realDiagnostics:realStats,synthetic:{windows:300,distinctTiles:150,lengthMeters:route.totalMeters,diagnostics:syntheticStats},
      lifecycleChecks:['stale route','stale sample epoch','client admission','sample bound','termination'],uiHeartbeatFrames:frames,
      limitations:['No game renderer or GPU workload','Synthetic long route is not real geographic evidence','Fixed partial directory, no worldwide publication or persistent cache','Snapshots are asynchronous; no per-tree runtime integration']};
  } finally {closed=true;for(const c of clients)c.dispose();}
}"""

def main(routes, output, executable):
    spec=importlib.util.spec_from_file_location('partition',ROOT/'tools/biomes/partition-refinement-batches.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*args):
            pass
    with tempfile.TemporaryDirectory(prefix='biome-r5-',dir=ROOT) as temporary:
        work=Path(temporary)
        packaging=module.build([routes],work/'real','resolve2017-r5-circuits')
        subprocess.run(['node',str(ROOT/'qa/biome-batch-fixtures-r5.mjs'),str(work/'synthetic')],check=True,cwd=ROOT)
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            with sync_playwright() as pw:
                browser=pw.chromium.launch(headless=True,executable_path=executable,args=['--no-sandbox'])
                page=browser.new_page();workers=[];page.on('worker',lambda w:workers.append(w.url))
                origin=f'http://127.0.0.1:{server.server_port}'
                page.goto(origin+'/')
                report=page.evaluate(JS,dict(base=origin+'/'+work.name+'/',
                  real=json.loads((work/'real/directory.json').read_text()),
                  synthetic=json.loads((work/'synthetic/directory.json').read_text()),
                  routes=json.loads((routes/'route-plan.json').read_text())['routes'],
                  expected=json.loads((routes/'route-source-expectations.json').read_text())))
                report.update(browser=browser.version,observedWorkerURLs=workers,packaging=packaging)
                assert len(workers)==2
                browser.close()
        finally:
            server.shutdown();server.server_close();thread.join()
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:report[k] for k in ['browser','nativeModuleWorker','real','lifecycleChecks','uiHeartbeatFrames']},indent=2))
    print('PASS R5 native browser/Worker batching (not game frame pacing)')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--routes',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    p.add_argument('--executable',default=None)
    a=p.parse_args();main(a.routes.resolve(),a.output.resolve(),a.executable)

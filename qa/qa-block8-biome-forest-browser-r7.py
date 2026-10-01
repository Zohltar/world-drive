#!/usr/bin/env python3
"""Actual forest candidate oracle + original source polygons + native Chromium.
Preparation uses the real dedicated Worker; this is not a gameplay FPS test.
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
def load(name, path):
    spec=importlib.util.spec_from_file_location(name,path)
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value

JS=r"""async ({base,directory,plan,expected,synthetic})=>{
  const {createBiomeWorkerClient}=await import('/src/scenery/biomes/biome-worker-client.js');
  const {createBiomeChunkContextBridge}=await import('/src/scenery/biomes/chunk-context-bridge.js');
  const {createForestCandidateAdapter,FOREST_LAYOUT_ID,forestChunkAtAbsolute}=await import('/src/scenery/biomes/forest-candidate-adapter.js');
  const {createBiomeRoutePlan}=await import('/src/scenery/biomes/route-tile-plan.js');
  const must=(v,m)=>{if(!v)throw new Error(m);};
  globalThis.DecompressionStream=class{constructor(){throw new Error('MAIN_THREAD_GZIP');}};
  crypto.subtle.digest=()=>{throw new Error('MAIN_THREAD_DIGEST');};
  const originalFetch=globalThis.fetch,originalImul=Math.imul;
  globalThis.fetch=(url,...args)=>{if(/(?:batch-\d+-\d+\.json|\.json\.gz)$/.test(String(url)))throw new Error('MAIN_TILE_IO');return originalFetch(url,...args);};
  const denySampler=()=>{throw new Error('MAIN_THREAD_FOREST_GENERATION_DURING_PREPARATION');};
  Math.imul=denySampler;
  let calls=0,frames=0,done=false;const clients=[],bridges=[];
  const beat=()=>{frames++;if(!done)requestAnimationFrame(beat);};requestAnimationFrame(beat);
  async function open(root,path){
    const c=createBiomeWorkerClient();clients.push(c);await c.initialize({directory:root,baseUrl:base+path+'/'});
    const measured={...c,captureForestChunk:r=>{calls++;must(!('points' in r),'main supplied full chunk');return c.captureForestChunk(r);}};
    const b=createBiomeChunkContextBridge({client:measured,identity:root,layoutId:FOREST_LAYOUT_ID,maxChunks:4,maxBytes:160000});
    bridges.push(b);return {c,b};
  }
  try{
    const {c,b}=await open(directory,'real'),results=[];
    for(let ri=0;ri<plan.routes.length;ri++){
      const r=plan.routes[ri],a=createForestCandidateAdapter(r);let count=0,resolved=0,noData=0;
      must((await b.setRoute(r.coordinates,{projectionId:a.projectionId})).status==='route-ready','real route');
      for(let si=0;si<r.samples.length;si++){
        const sample=r.samples[si];must((await b.update(sample.position)).status==='ready','real window');
        const out=await b.prepareForestChunk({cx:sample.cx,cz:sample.cz,origin:r.origin,routeId:r.routeId});
        must(out.status==='prepared','real procedural snapshot '+out.reason);
        for(let i=0;i<1744;i++){
          // Positions came from the ORIGINAL core/main bodies, not this adapter.
          const [lon,lat]=sample.points[i],q=out.snapshot.lookup(i,lon,lat),want=expected[ri][si][i];
          must(q.status!=='unavailable','actual forest candidate unavailable');
          must((q.ecoregion?.id??null)===want,'actual forest source-record mismatch');
          must(q.placementAuthority===false&&Object.isFrozen(q),'forest authority');
          if(q.status==='no-data')noData++;else resolved++;count++;
        }
      }
      results.push({name:r.name,chunks:r.samples.length,candidates:count,resolved,noData,unavailable:0,mismatches:0});
    }
    const realBridge=b.diagnostics(),realWorker=await c.diagnostics();b.dispose();
    const s=await open(synthetic,'synthetic'),coords=Array.from({length:150},(_,i)=>[(1800+i+.5)/10-180,-.05]);
    const length=createBiomeRoutePlan(coords).totalMeters,origin={lat:-.05,lon:0},routeId='r7-synthetic';
    const a=createForestCandidateAdapter({origin,routeId});await s.b.setRoute(coords,{projectionId:a.projectionId});
    let last=null,lastPoint=null,exactReads=0;
    for(let k=0;k<300;k++){
      const i=k<150?k:299-k,x=(coords[i][0]-origin.lon)*Math.PI/180*6378137*Math.cos(origin.lat*Math.PI/180);
      const chunk=forestChunkAtAbsolute(x,0);
      must((await s.b.update(length*i/149,{aheadMeters:1000,behindMeters:0,corridorMeters:0})).status==='ready','mock window');
      const out=await s.b.prepareForestChunk({...chunk,origin,routeId});must(out.status==='prepared',out.reason);
      // Main-thread sampler is enabled ONLY for bounded per-point test assertions,
      // never during preparation. Real-source tests above use the independent oracle.
      const scratch={};Math.imul=originalImul;
      try{for(let j=0;j<1744;j++){a.point(chunk.cx,chunk.cz,j,scratch);
        must(out.snapshot.lookup(j,scratch.lon,scratch.lat).ecoregion?.id===i%2+1,'mock exact candidate');exactReads++;}
        lastPoint={...a.point(chunk.cx,chunk.cz,0,scratch)};
      }finally{Math.imul=denySampler;}
      last=out.snapshot;
    }
    const before=calls,context=last.lookup(0,lastPoint.lon,lastPoint.lat);
    for(let i=0;i<100000;i++)must(last.lookup(0,lastPoint.lon,lastPoint.lat)===context,'stable synchronous read');
    must(calls===before,'read spawned Worker work');
    const stats=s.b.diagnostics();must(stats.peakChunks<=4&&stats.peakBytes<=160000&&stats.peakPendingChunks<=2,'bridge budget');
    const stale=s.b.prepareForestChunk({cx:12,cz:0,origin,routeId,refresh:true});
    const update=s.b.update(0,{aheadMeters:1000,behindMeters:0,corridorMeters:0});
    must((await stale).status==='discarded','stale forest window');await update;
    const staleRoute=s.b.prepareForestChunk({cx:12,cz:0,origin,routeId,refresh:true});
    const changed=s.b.setRoute(coords,{projectionId:a.projectionId});must((await staleRoute).status==='discarded','stale forest route');await changed;
    must(last.lookup(0,lastPoint.lon,lastPoint.lat).status==='unavailable','held old snapshot');
    await s.b.update(0,{aheadMeters:1000,behindMeters:0,corridorMeters:0});
    const recovered=await s.b.prepareForestChunk({cx:12,cz:0,origin,routeId});must(recovered.status==='prepared','recovery');
    const syntheticWorker=await s.c.diagnostics();s.b.dispose();must(frames>0,'heartbeat');
    return {status:'PASS',nativeForestWorker:true,mainSamplerTrappedDuringPreparation:true,mainHeavyApisTrapped:true,
      real:results,realBridge,realWorker,synthetic:{windows:300,pointsPerChunk:1744,exactReads,bridge:stats,worker:syntheticWorker},
      captureCalls:calls,synchronousReads:100000,uiHeartbeatFrames:frames,
      limitations:['No game lifecycle/renderer/GPU integration','Raw candidates, not accepted roots/current tree cover',
        'Long progression is mock geography','Main-thread bounded validation is not total heap/frame-time certification']};
  }finally{done=true;Math.imul=originalImul;for(const b of bridges)b.dispose();for(const c of clients)c.dispose();}
}"""

def main(source, atlas, output):
    output.mkdir(parents=True,exist_ok=True)
    subprocess.run(['node',str(ROOT/'qa/qa-block8-biome-forest-parity-r7.mjs'),'--plan',str(output),
                    '--report',str(output/'forest-parity-r7.json')],check=True,cwd=ROOT)
    plan=json.loads((output/'forest-plan.json').read_text())
    refine=load('r7_refine',ROOT/'tools/biomes/build-local-refinement.py')
    oracle=load('r7_oracle',ROOT/'qa/qa-block8-biome-source-parity-r1.py')
    partition=load('r7_partition',ROOT/'tools/biomes/partition-refinement-batches.py')
    points=[p for r in plan['routes'] for s in r['samples'] for p in s['points']]
    addresses=sorted(set(map(tuple,plan['addresses']))|set(refine.select_tiles(points)))
    manifest=json.loads((atlas/'manifest.json').read_text())
    index=refine.SourceIndex.from_archive(source,manifest,addresses)
    pack=output/'tiles';refine.write_tiles(index,addresses,pack)
    expected=[]
    for r in plan['routes']:
        rows=[]
        for s in r['samples']:
            slots,_=oracle.source_slots(index.tree,index.slots,s['points'])
            rows.append([index.records[int(slot)]['id'] if slot else None for slot in slots])
        expected.append(rows)
    (output/'forest-source-expectations.json').write_text(json.dumps(expected))
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def do_GET(self):
            if self.path=='/__biome-r7-harness__':
                body=b'<!doctype html><meta charset="utf-8"><title>Forest coordinate QA</title>'
                self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
            else: super().do_GET()
        def log_message(self,*args): pass
    with tempfile.TemporaryDirectory(prefix='biome-r7-',dir=ROOT) as tmp:
        work=Path(tmp);packaging=partition.build([pack],work/'real','resolve2017-r7-forest')
        subprocess.run(['node',str(ROOT/'qa/biome-batch-fixtures-r5.mjs'),str(work/'synthetic')],check=True,cwd=ROOT)
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            with sync_playwright() as pw:
                browser=pw.chromium.launch(headless=True,args=['--no-sandbox'])
                page=browser.new_page();workers=[];errors=[]
                page.on('worker',lambda w:workers.append(w.url));page.on('pageerror',lambda e:errors.append(str(e)))
                origin=f'http://127.0.0.1:{server.server_port}';page.goto(origin+'/__biome-r7-harness__')
                report=page.evaluate(JS,dict(base=origin+'/'+work.name+'/',plan=plan,expected=expected,
                    directory=json.loads((work/'real/directory.json').read_text()),
                    synthetic=json.loads((work/'synthetic/directory.json').read_text())))
                assert len(workers)==2 and not errors,(workers,errors)
                report.update(browser=browser.version,workerURLs=workers,packaging=packaging,sourceSha256=refine.SOURCE_SHA)
                browser.close()
        finally: server.shutdown();server.server_close();thread.join()
    (output/'forest-browser-r7-qa.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:report[k] for k in ['status','browser','real','captureCalls','synchronousReads']},indent=2))
    print('PASS R7 actual forest candidates via native Worker (not game FPS)')
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',required=True,type=Path);p.add_argument('--atlas',required=True,type=Path);p.add_argument('--output',required=True,type=Path)
    a=p.parse_args();main(a.source.resolve(),a.atlas.resolve(),a.output.resolve())

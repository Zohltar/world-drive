#!/usr/bin/env python3
"""Actual public route-lifecycle factory + native diagnostic Worker, source/build.
Other game services are stubbed; this is NOT Three.js gameplay/FPS certification.
"""
import argparse, functools, http.server, importlib.util, json, shutil, subprocess, tempfile, threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
JS=r'''async ({base,directory,plan,expected,built})=>{
  const factory=built?globalThis.__R8Factory:(await import('/src/route-lifecycle.js')).createRouteLifecycle;
  const must=(v,m)=>{if(!v)throw new Error(m);};
  const wait=async predicate=>{const end=performance.now()+15000;while(performance.now()<end){if(predicate())return;await new Promise(r=>setTimeout(r,25));}throw new Error('observer timeout '+JSON.stringify(api.snapshot()));};
  const noop=()=>{},reset={reset:noop},label=()=>({textContent:''});
  const state={gameStarted:true,autopilot:false,origin:{lat:0,lon:0},absX:0,absZ:0},route=[],segments=[];
  const position=(lon,lat)=>({x:(lon-state.origin.lon)*Math.PI/180*6378137*Math.cos(state.origin.lat*Math.PI/180),z:-(lat-state.origin.lat)*Math.PI/180*6378137});
  const options={version:'r8-diagnostic-qa',getState:()=>state,setState:v=>Object.assign(state,v),route,segments,
    validLatLon:()=>true,geoDist:()=>1000,toast:noop,setAutopilot:noop,resetStreamingCoordinator:noop,
    waterData:reset,skidMarks:{clear:noop},bridgeManager:{reset:noop,resetCounter:noop},bridgeStatus:label(),
    waterRenderer:{clear:noop},sceneryData:reset,elevationService:reset,imageryService:{enabled:false,reset:noop},signData:reset,
    resetMinimapSignReadout:noop,signStatus:label(),updateRoadMetaHUD:noop,clearActiveRoadProfile:noop,
    terrainService:{clearRoadBed:noop,clearHorizon:noop},clearGroup:noop,roadGroup:{},forestGroup:{},infrastructureGroup:{},signGroup:{},
    sceneryRenderer:{clearForestCache:noop,clear:noop},resetRunChallenge:noop,
    loading:{classList:{add:noop,remove:noop}},loadingText:label(),routingStatus:label(),statusEl:label(),setBootProgress:noop,
    routingService:{fetchRoute:async()=>{throw new Error('QA requires authored actual route');}},toWorld:(lat,lon)=>position(lon,lat),prepMap:noop,
    placeAt:()=>{state.absX=route[0].x;state.absZ=route[0].z;},loadWaterAround:async()=>({ok:true}),preloadRoute:noop,
    loadElevationAround:async()=>false,primeInitialTerrainPreloadBuffer:async()=>{},buildImageryMosaic:async()=>{},
    onElevationFallback:noop,onImageryFallback:noop,promiseWithTimeout:p=>p,hasPendingWorld:()=>false,cancelVisualJob:noop,
    commitLocalWorldRefresh:()=>false,prefetchRouteAhead:noop,loadSceneryAround:async()=>true,onSceneryUnavailable:noop,
    loadRoadMetadataAround:async()=>true,loadGeographicSignsAround:async()=>true};
  const lifecycle=factory(options),api=WorldDriveDiagnostics.forest.biomes;
  must(api.snapshot().enabled===false,'default must be disabled');
  const NativeWorker=globalThis.Worker;let created=0,terminated=0;
  globalThis.Worker=class extends NativeWorker{constructor(...args){super(...args);created++;}terminate(){terminated++;return super.terminate();}};
  const originalFetch=globalThis.fetch,imul=Math.imul;
  globalThis.fetch=(url,...args)=>{if(/(?:batch-\d+-\d+\.json|\.json\.gz)$/.test(String(url)))throw new Error('MAIN_TILE_IO');return originalFetch(url,...args);};
  globalThis.DecompressionStream=class{constructor(){throw new Error('MAIN_GZIP');}};
  crypto.subtle.digest=()=>{throw new Error('MAIN_DIGEST');};
  const deny=()=>{throw new Error('MAIN_FOREST_GENERATION_DURING_PREPARATION');};
  async function choose(coordinates){
    Math.imul=imul;const [lon,lat]=coordinates[0],end=coordinates.at(-1);
    const p=lifecycle.createRequestedRoute({lat,lon,name:'test'},{lat:end[1],lon:end[0],name:'end'},[],
      {coordinates,provider:'actual repository circuit',routeKind:'circuit'});
    must(api.snapshot().last==null,'invalidation must be synchronous');
    must(await p===true,'original lifecycle route failed');
  }
  const results=[];
  try{
    await choose(plan.routes[0].coordinates);await new Promise(r=>setTimeout(r,350));must(created===0,'disabled allocated Worker');
    Math.imul=deny;await api.start({directory,baseUrl:base});
    for(let ri=0;ri<plan.routes.length;ri++){
      const r=plan.routes[ri];if(ri)await choose(r.coordinates);
      let samples=0;Math.imul=deny;
      for(let si=0;si<r.samples.length;si++){
        const s=r.samples[si];state.absX=s.cx*480+240;state.absZ=s.cz*480+240;api.refresh();
        await wait(()=>{const d=api.snapshot();return d.phase==='observed'&&d.freshCurrentChunk
          &&d.last.generation===lifecycle.worldDrive.route.generation;});
        Math.imul=imul;
        for(let i=0;i<1744;i++){
          const q=api.sample(s.cx,s.cz,i);must((q.ecoregion?.id??null)===expected[ri][si][i],'R8 source mismatch');
          must(q.status!=='unavailable'&&q.placementAuthority===false,'R8 unavailable or authority');samples++;
        }
        Math.imul=deny;
      }
      const d=api.snapshot();must(d.maxChunksRequested<=4&&d.bridge.peakChunks<=16,'observer bound');
      results.push({name:r.name,chunks:r.samples.length,candidates:samples,mismatches:0,diagnostics:d});
    }
    // Missing pilot geography is an honest missing window, not a default forest.
    await choose([[0,0],[.01,0],[.02,0]]);Math.imul=deny;
    await wait(()=>api.snapshot().phase==='missing-coverage');
    const before=api.snapshot().windows;await new Promise(r=>setTimeout(r,900));
    must(api.snapshot().windows===before,'stationary missing window repeatedly retried');
    Math.imul=imul;must(api.sample(0,0,0).status==='unavailable','missing geography must remain unavailable');
    globalThis.dispatchEvent(new Event('pagehide'));must(api.snapshot().enabled===false,'pagehide did not stop');
    must(terminated===created,'leaked worker');
    return {status:'PASS',mode:built?'vite-production-facade':'native-esm-facade',actualPublicRouteLifecycle:true,
      actualDedicatedWorkers:created,terminated,defaultDisabled:true,mainHeavyOperationsTrapped:true,
      stationaryMissingWindowNotRetried:true,real:results,
      limitations:['Other gameplay services stubbed; not a full Three.js driving run','No FPS/GPU conclusion','Four diagnostic chunks, not complete forest coverage']};
  }finally{Math.imul=imul;api.stop();globalThis.Worker=NativeWorker;}
}'''
def serve(directory,callback):
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def do_GET(self):
            if self.path=='/__r8__':
                raw=b'<!doctype html><meta charset="utf-8"><title>R8 lifecycle QA</title>'
                self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
            else: super().do_GET()
        def log_message(self,*args):pass
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(directory)))
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:return callback(f'http://127.0.0.1:{server.server_port}')
    finally:server.shutdown();server.server_close();thread.join()
def main(forest,output):
    output.mkdir(parents=True,exist_ok=True)
    spec=importlib.util.spec_from_file_location('partition',ROOT/'tools/biomes/partition-refinement-batches.py')
    partition=importlib.util.module_from_spec(spec);spec.loader.exec_module(partition)
    plan=json.loads((forest/'forest-plan.json').read_text());expected=json.loads((forest/'forest-source-expectations.json').read_text())
    with tempfile.TemporaryDirectory(prefix='biome-r8-',dir=ROOT) as temp:
        work=Path(temp);partition.build([forest/'tiles'],work/'real','resolve2017-r8-diagnostic')
        directory=json.loads((work/'real/directory.json').read_text())
        html=work/'harness.html'
        html.write_text('''<!doctype html><meta charset="utf-8"><title>R8 production harness</title>
<script type="module">import {createRouteLifecycle} from '/src/route-lifecycle.js';globalThis.__R8Factory=createRouteLifecycle;</script>''')
        # Build the actual public facade with Vite, including its lazy module and Worker.
        script="import {build} from 'vite';await build({configFile:false,root:process.cwd(),publicDir:false,build:{outDir:process.argv[2],rollupOptions:{input:process.argv[1]}}});"
        subprocess.run(['node','--input-type=module','-e',script,str(html),str(work/'dist')],cwd=ROOT,check=True)
        shutil.copytree(work/'real',work/'dist/real')
        built_html=next((work/'dist').rglob('*.html')).relative_to(work/'dist').as_posix()
        reports=[]
        with sync_playwright() as pw:
            browser=pw.chromium.launch(headless=True)
            for built in (False,True):
                def execute(origin):
                    page=browser.new_page();errors=[];workers=[]
                    page.on('pageerror',lambda e:errors.append(str(e)));page.on('worker',lambda w:workers.append(w.url))
                    page.goto(origin+'/'+built_html if built else origin+'/__r8__')
                    if built:page.wait_for_function('typeof __R8Factory === "function"')
                    report=page.evaluate(JS,dict(base=origin+'/real/' if built else origin+'/'+work.name+'/real/',
                      directory=directory,plan=plan,expected=expected,built=built))
                    assert not errors,errors
                    assert report['actualDedicatedWorkers']==len(workers)>0
                    report.update(browser=browser.version,workerURLs=workers,pageErrors=errors);page.close();return report
                reports.append(serve(work/'dist' if built else ROOT,execute))
            browser.close()
        shutil.copytree(work/'real',output/'pilot')
    (output/'gameplay-browser-r8-qa.json').write_text(json.dumps({'status':'PASS','runs':reports},indent=2)+'\n')
    print(json.dumps({'status':'PASS','modes':[r['mode'] for r in reports],
      'candidatesPerMode':[sum(t['candidates'] for t in r['real']) for r in reports]},indent=2))
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--forest',required=True,type=Path);p.add_argument('--output',required=True,type=Path)
    a=p.parse_args();main(a.forest.resolve(),a.output.resolve())

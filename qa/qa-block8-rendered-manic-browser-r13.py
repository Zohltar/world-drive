#!/usr/bin/env python3
"""Real Manic captured route + full Vite/Three game + native biome Worker.
Only geographic HTTP providers are fixtures; no game or renderer replacement.
Not a human GPU/high-speed driving test. Existing R12 native gates stay separate.
"""
import argparse
from collections import Counter
import gzip
import importlib.util
import json
from pathlib import Path
import shutil
import socket
import subprocess
import time
import urllib.parse
import urllib.request
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
INSTALL=Path('public/local-data/biomes/pilot-r13');URL='/local-data/biomes/pilot-r13/'
SNAP='()=>WorldDriveDiagnostics.forest.visualPilot.snapshot()'
spec=importlib.util.spec_from_file_location('r13_r9',ROOT/'qa/qa-block8-biome-fullgame-r9.py')
R9=importlib.util.module_from_spec(spec);spec.loader.exec_module(R9)
network_spec=importlib.util.spec_from_file_location('r13_network',ROOT/'qa/qa-block8-rendered-manic-network-r13.py')
R13_NETWORK=importlib.util.module_from_spec(network_spec);network_spec.loader.exec_module(R13_NETWORK)
ORACLE=r'''async ({directory,base,plan,expected})=>{
 const {createBiomeWorkerClient}=await import('/src/scenery/biomes/biome-worker-client.js');
 const {createBiomeChunkContextBridge}=await import('/src/scenery/biomes/chunk-context-bridge.js');
 const {createForestCandidateAdapter,FOREST_LAYOUT_ID}=await import('/src/scenery/biomes/forest-candidate-adapter.js');
 const {createR12Proof,R13_PROFILE}=await import('/tools/biomes/rendered-pilot-policy-r12.mjs');
 const c=createBiomeWorkerClient(),a=createForestCandidateAdapter(plan),seen=new Set();let bridge,reads=0,eligible=0,refused=0;
 try{
  await c.initialize({directory,baseUrl:base});
  bridge=createBiomeChunkContextBridge({client:c,identity:directory,layoutId:FOREST_LAYOUT_ID,maxChunks:16});
  if((await bridge.setRoute(plan.coordinates,{projectionId:a.projectionId})).status!=='route-ready')throw new Error('oracle route');
  for(const w of plan.windows){
   const todo=w.chunks.filter(x=>!seen.has(x.key));if(!todo.length)continue;
   if((await bridge.update(w.position,w.options)).status!=='ready')throw new Error('oracle window '+w.position);
   for(const chunk of todo){
    const out=await bridge.prepareForestChunk({cx:chunk.cx,cz:chunk.cz,origin:plan.origin,routeId:plan.routeId});
    if(out.status!=='prepared')throw new Error('oracle prepare '+chunk.key);
    const raw=Uint8Array.from(atob(expected[chunk.key]),x=>x.charCodeAt(0));if(raw.length!==3488)throw new Error('oracle length');
    const dv=new DataView(raw.buffer),point={};let all=true;
    for(let i=0;i<1744;i++){
     a.point(chunk.cx,chunk.cz,i,point);const got=out.snapshot.lookup(i,point.lon,point.lat),want=directory.records[dv.getUint16(i*2,true)]?.id??null;
     if(got.status==='unavailable'||(got.ecoregion?.id??null)!==want)throw new Error('original polygon mismatch '+chunk.key+'/'+i);
     all&&=want===373;reads++;
    }
    const proof=createR12Proof(out.snapshot,a,chunk.cx,chunk.cz,R13_PROFILE);let step;do{step=proof.step();}while(!step.done);
    if(!!proof.result()!==all)throw new Error('homogeneous boreal proof mismatch');
    if(all)eligible++;else refused++;seen.add(chunk.key);
   }
  }
  if(seen.size!==plan.chunks.length)throw new Error('missing oracle chunks');
  const stats=bridge.diagnostics();if(stats.peakChunks>16||stats.rejected!==0||stats.evictions===0)throw new Error('oracle cache');
  return {status:'PASS',chunks:seen.size,exactReads:reads,eligible,refused,bridge:stats,worker:await c.diagnostics()};
 }finally{bridge?.dispose();c.dispose();}
}'''
SEASONS=r'''()=>{
 const api=WorldDriveDiagnostics.forest.visualPilot,before=api.audit();
 const identity=x=>x.meshes.map(m=>[m.key,m.count,m.matrixHash,m.matrixBytes]);const original=identity(before);
 if(!before.meshes.length||before.meshes.some(m=>m.model!=='preview-conifer'||m.triangles!==68||m.ecoregion!==373))throw new Error('summer models');
 api.season('winter');const winter=api.audit();
 if(JSON.stringify(original)!==JSON.stringify(identity(winter)))throw new Error('winter placement');
 if(winter.meshes.some(m=>m.model!=='preview-conifer-winter'||m.triangles!==180||m.baseTriangles!==68||m.proofCandidates!==1744||!m.geometryOnly))throw new Error('winter models');
 for(let i=0;i<20;i++){api.season('summer');api.season('winter');}
 const after=api.audit();if(JSON.stringify(original)!==JSON.stringify(identity(after)))throw new Error('season round trips');
 return {before,winter,after,roundTrips:20};
}'''
def main(pilot,r10,output):
    output.mkdir(parents=True,exist_ok=False);destination=ROOT/INSTALL
    if destination.exists():raise FileExistsError('Do not overwrite installed R13 data')
    shutil.copytree(pilot/INSTALL,destination)
    log=None;server=None
    report={'status':'RUNNING','realVite':True,'fullGame':True,'runtimeStubs':False,'gpuPerformanceCertification':False,
        'browserEnvironment':{'viewportCss':{'width':1100,'height':700},'deviceScaleFactor':1,'requiredRenderedChunks':4,'timeoutMs':120000}}
    errors=[];engine=[];requests=[];routing_requests=[];upstream=Counter()
    try:
        subprocess.run(['npm','run','build'],cwd=ROOT,check=True)
        report['productionBuild']=True
        with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
        origin=f'http://127.0.0.1:{port}';log=(output/'vite.log').open('w')
        server=subprocess.Popen(['node','node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',str(port),'--strictPort'],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
        for _ in range(100):
            try:
                with urllib.request.urlopen(origin,timeout=1) as response:
                    if response.status==200:break
            except Exception:
                if server.poll() is not None:raise RuntimeError('Vite failed')
                time.sleep(.2)
        else:raise TimeoutError('Vite startup')
        route_fixture=gzip.decompress((ROOT/'qa/fixtures/biomes/manic-r10/response.json.gz').read_bytes())
        with sync_playwright() as pw:
            browser=pw.chromium.launch(headless=True,args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
            context=browser.new_context(viewport={'width':1100,'height':700},device_scale_factor=1)
            context.add_init_script(R9.INSTRUMENT)
            def network(route):
                url=route.request.url;parsed=urllib.parse.urlsplit(url)
                if url.startswith(origin+'/'):
                    if URL in url:requests.append(parsed.path)
                    return route.continue_()
                upstream[parsed.netloc]+=1;headers={'Access-Control-Allow-Origin':'*'}
                matched=R13_NETWORK.is_manic_route_request(url)
                if '/route/v1/' in parsed.path and len(routing_requests)<8:routing_requests.append({'url':url,'matchedRealManicFixture':matched})
                if matched:return route.fulfill(status=200,content_type='application/json',headers=headers,body=route_fixture)
                return route.fulfill(status=503,content_type='text/plain',headers=headers,body='R13 controlled geographic fixture')
            context.route('**/*',network)
            page=context.new_page();page.set_default_timeout(120000)
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('console',lambda m:engine.append(m.text[:1000]) if any(x in m.text for x in ['Frame error:','Startup error','Vehicle start failed','Audio frame error']) else None)
            try:
                page.goto(origin+'/tools/biomes/vegetation-preview-r11.html',wait_until='networkidle')
                report['sourceOracle']=page.evaluate(ORACLE,{'directory':json.loads((destination/'directory.json').read_text()),'base':origin+URL,
                    'plan':json.loads((r10/'route-plan.json').read_text()),'expected':json.loads((r10/'source-expectations.json').read_text())})
                assert not errors and not engine,(errors,engine)
                page.close();requests.clear()
                page=context.new_page();page.set_default_timeout(120000)
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.on('console',lambda m:engine.append(m.text[:1000]) if any(x in m.text for x in ['Frame error:','Startup error','Vehicle start failed','Audio frame error']) else None)
                page.goto(origin,wait_until='domcontentloaded');page.wait_for_selector('.v21VehicleChoice')
                page.locator('.v21VehicleChoice').first.click();page.locator('#v21StartButton').click()
                page.wait_for_function("document.getElementById('v21Startup').classList.contains('hidden')")
                page.wait_for_function("WorldDriveFramePacing().rendering.routeKind==='road' && WorldDriveFramePacing().rendering.routePoints===1497 && document.getElementById('loading').classList.contains('hidden')")
                page.wait_for_function('WorldDriveFramePacing().rendering.groups.sceneryForest.instancedMeshes>=4')
                assert page.evaluate(SNAP)['enabled'] is False and not requests
                assert page.evaluate('()=>__R9_WORKERS.filter(w=>w.url.includes("biome-preparation")).length')==0
                report['offNoWorkerOrData']=True;report['offBefore']=page.evaluate(R9.FRAMES,3000)
                result=page.evaluate("async u=>(await import(u)).start({season:'summer'})",URL+'start.mjs');assert result['pilot']=='r13-manic-boreal'
                page.wait_for_function("()=>{const s=WorldDriveDiagnostics.forest.visualPilot.snapshot();if(s.phase==='fault')throw new Error(s.error);return s.modifiedChunks>=4 && s.proofsCompleted>=4;}")
                report['summer']=page.evaluate(SNAP);assert report['summer']['failures']==0 and report['summer']['error'] is None
                assert report['summer']['worker']['transport']['loaded']>0 and report['summer']['worker']['transport']['rejected']==0
                report['summerFrames']=page.evaluate(R9.FRAMES,3000);page.screenshot(path=str(output/'manic-summer.png'))
                report['seasonIdentity']=page.evaluate(SEASONS);report['winterFrames']=page.evaluate(R9.FRAMES,3000)
                report['winter']=page.evaluate(SNAP);page.screenshot(path=str(output/'manic-winter.png'))
                assert report['winter']['failures']==0 and report['winter']['error'] is None
                page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.stop()');page.wait_for_timeout(750)
                count=len(requests);report['offAfter']=page.evaluate(R9.FRAMES,3000)
                assert len(requests)==count and page.evaluate(SNAP)['modifiedChunks']==0
                assert all(w['terminated'] for w in page.evaluate('()=>__R9_WORKERS') if 'biome-preparation' in w['url'])
                page.evaluate("async u=>(await import(u)).start({season:'winter'})",URL+'start.mjs')
                page.wait_for_function('WorldDriveDiagnostics.forest.visualPilot.snapshot().modifiedChunks>=2')
                before=page.evaluate(SNAP)['proofsCompleted']
                page.evaluate("()=>{const i=document.getElementById('jump');i.value=10;i.dispatchEvent(new Event('input'));document.getElementById('jumpBtn').click();WorldDriveDiagnostics.forest.visualPilot.refresh();}")
                page.wait_for_function('n=>WorldDriveDiagnostics.forest.visualPilot.snapshot().proofsCompleted>n',arg=before)
                report['afterJump']=page.evaluate(SNAP)
                report['routeReset']=page.evaluate("()=>{document.getElementById('presetNordschleifeBtn').click();return WorldDriveDiagnostics.forest.visualPilot.snapshot();}")
                assert report['routeReset']['enabled'] is False and report['routeReset']['modifiedChunks']==0
                assert all(w['terminated'] for w in page.evaluate('()=>__R9_WORKERS') if 'biome-preparation' in w['url'])
                assert not errors and not engine,(errors,engine)
                report.update(status='PASS',browser=browser.version,workers=page.evaluate('()=>__R9_WORKERS'))
            except Exception as error:
                report.update(status='FAIL',failure=str(error))
                try:
                    report['stalledPilot']=page.evaluate(SNAP);report['stalledFrame']=page.evaluate('()=>WorldDriveFramePacing()')
                    page.screenshot(path=str(output/'failure.png'));print(json.dumps(report['stalledPilot']),flush=True)
                except Exception as capture:report['captureError']=str(capture)
                raise
            finally:context.close();browser.close()
    finally:
        report.update(pageErrors=errors,engineErrors=engine,pilotRequests=requests,upstreamRequests=dict(upstream),routingRequests=routing_requests,
            limitations=['Software-rendered Chromium /1100x700 /DPR1, not user GPU or high-speed performance',
                'Pinned real router snapshot, not live routing or a GPS trace','Homogeneous regional family, not actual species or current land cover',
                'Parked summer/winter samples and actual UI jump; not a continuous 191 km rendered drive'])
        (output/'rendered-manic-r13-qa.json').write_text(json.dumps(report,indent=2)+'\n')
        if server:
            server.terminate()
            try:server.wait(timeout=10)
            except subprocess.TimeoutExpired:server.kill();server.wait()
        if log:log.close()
        shutil.rmtree(destination)
    print(json.dumps({'status':report['status'],'oracleReads':report['sourceOracle']['exactReads'],'summerChunks':report['summer']['modifiedChunks']}))
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('pilot','r10','output'):p.add_argument('--'+name,type=Path,required=True)
    a=p.parse_args();main(a.pilot.resolve(),a.r10.resolve(),a.output.resolve())

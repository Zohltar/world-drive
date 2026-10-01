#!/usr/bin/env python3
"""Real Vite/Three game and native Worker, finite Yungas tropical pilot.
External geographic providers are controlled; pale fallback ground is NOT snow.
This is not a user-GPU benchmark or a continuous high-speed drive.
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
INSTALL=Path('public/local-data/biomes/pilot-r15')
URL='/local-data/biomes/pilot-r15/'
SNAP='() => WorldDriveDiagnostics.forest.visualPilot.snapshot()'
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
R9=load('r15_r9',ROOT/'qa/qa-block8-biome-fullgame-r9.py')
NETWORK=load('r15_network',ROOT/'qa/qa-block8-rendered-manic-network-r13.py')
YUNGAS=load('r15_yungas_network',ROOT/'qa/qa-block8-rendered-yungas-network-r15.py')
ORACLE=r'''async ({directory,base,plan,expected})=>{
 const {createBiomeWorkerClient}=await import('/src/scenery/biomes/biome-worker-client.js');
 const {createBiomeChunkContextBridge}=await import('/src/scenery/biomes/chunk-context-bridge.js');
 const {createForestCandidateAdapter,FOREST_LAYOUT_ID}=await import('/src/scenery/biomes/forest-candidate-adapter.js');
 const {createBiomeRoutePlan}=await import('/src/scenery/biomes/route-tile-plan.js');
 const {R15_PROFILE,renderedWindowOptions,createR12Proof}=await import('/tools/biomes/rendered-pilot-policy-r12.mjs');
 const a=createForestCandidateAdapter({origin:plan.origin,routeId:'r15-oracle'}),rp=createBiomeRoutePlan(plan.coordinates),client=createBiomeWorkerClient();
 let bridge=null,reads=0,eligible=0,refused=0,mixed=0;const regions={};
 try{
  await client.initialize({directory,baseUrl:base});
  bridge=createBiomeChunkContextBridge({client,identity:directory,layoutId:FOREST_LAYOUT_ID,maxChunks:16});
  if((await bridge.setRoute(plan.coordinates,{projectionId:a.projectionId})).status!=='route-ready')throw new Error('oracle route');
  for(const s of plan.samples){
   if((await bridge.update(rp.distanceAtVertex(s.anchorIndex),renderedWindowOptions(R15_PROFILE))).status!=='ready')throw new Error('oracle window');
   const r=await bridge.prepareForestChunk({cx:s.cx,cz:s.cz,origin:plan.origin,routeId:a.routeId});
   if(r.status!=='prepared')throw new Error('oracle chunk');
   const bytes=Uint8Array.from(atob(expected[s.key]),c=>c.charCodeAt(0)),want=new DataView(bytes.buffer),ids=new Set();let all=true;
   for(let i=0;i<1744;i++){
    const p=a.point(s.cx,s.cz,i),c=r.snapshot.lookup(i,p.lon,p.lat),id=c.ecoregion?.id??0;
    if(c.status==='unavailable'||id!==want.getUint16(i*2,true))throw new Error('source mismatch '+s.key+'/'+i);
    regions[id]=(regions[id]??0)+1;all&&=id===444;ids.add(id);reads++;
   }
   const proof=createR12Proof(r.snapshot,a,s.cx,s.cz,R15_PROFILE);let step;
   do{step=proof.step();}while(!step.done);
   if(!!proof.result()!==all)throw new Error('mixed/foreign source was accepted');
   if(all)eligible++;else refused++;if(ids.size>1)mixed++;
  }
  if(reads!==462160||eligible!==265||refused!==0||mixed!==0)throw new Error('oracle coverage changed');
  return {status:'PASS',chunks:plan.samples.length,reads,eligible,refused,mixed,regions,bridge:bridge.diagnostics(),worker:await client.diagnostics()};
 }finally{bridge?.dispose();client.dispose();}
}'''
CHECK=r'''()=>{
 const api=WorldDriveDiagnostics.forest.visualPilot,before=api.audit();
 if(before.meshes.length<4)throw new Error('rendered mesh gate');
 for(const m of before.meshes)if(m.model!=='preview-tropical'||m.triangles!==60||m.baseTriangles!==68||m.proofCandidates!==1744||m.ecoregion!==444||!m.geometryOnly)throw new Error('tropical geometry');
 let rejected=0;
 for(let i=0;i<20;i++){
  try{api.season('winter');}catch(e){if(!String(e).includes('non disponible'))throw e;rejected++;}
  api.season('summer');
 }
 if(rejected!==20||JSON.stringify(api.audit())!==JSON.stringify(before))throw new Error('unsupported season destroyed current geometry');
 const s=api.snapshot();if(!s.enabled||s.season!=='summer'||s.error!==null)throw new Error('invalid summer state');
 return {before,after:api.audit(),unsupportedWinterRejections:rejected};
}'''
def main(pilot,output):
    output.mkdir(parents=True,exist_ok=False);destination=ROOT/INSTALL;bundled=destination.exists()
    if bundled:assert (destination/'directory.json').read_bytes()==(pilot/INSTALL/'directory.json').read_bytes()
    else:shutil.copytree(pilot/INSTALL,destination)
    log=None;server=None;errors=[];engine=[];requests=[];upstream=Counter()
    report={'status':'RUNNING','realVite':True,'fullGame':True,'runtimeStubs':False,'gpuPerformanceCertification':False,
        'browserEnvironment':{'width':1100,'height':700,'deviceScaleFactor':1,'requiredRenderedChunks':4,'timeoutMs':120000}}
    try:
        subprocess.run(['npm','run','build'],cwd=ROOT,check=True);report['productionBuild']=True
        with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
        origin=f'http://127.0.0.1:{port}';log=(output/'vite.log').open('w')
        server=subprocess.Popen(['node','node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',str(port),'--strictPort'],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
        for _ in range(100):
            try:
                with urllib.request.urlopen(origin,timeout=1) as r:
                    if r.status==200:break
            except Exception:
                if server.poll() is not None:raise RuntimeError('Vite failed')
                time.sleep(.2)
        else:raise TimeoutError('Vite startup')
        yungas_fixture=gzip.decompress((ROOT/'qa/fixtures/biomes/yungas-r15/response.json.gz').read_bytes())
        fixture=gzip.decompress((ROOT/'qa/fixtures/biomes/manic-r10/response.json.gz').read_bytes())
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
                if NETWORK.is_manic_route_request(url):return route.fulfill(status=200,content_type='application/json',headers=headers,body=fixture)
                if YUNGAS.is_yungas_route_request(url):return route.fulfill(status=200,content_type='application/json',headers=headers,body=yungas_fixture)
                return route.fulfill(status=503,content_type='text/plain',headers=headers,body='R15 controlled geographic fixture')
            context.route('**/*',network)
            def new_page():
                p=context.new_page();p.set_default_timeout(120000)
                p.on('pageerror',lambda e:errors.append(str(e)))
                p.on('console',lambda m:engine.append(m.text[:1000]) if any(x in m.text for x in ['Frame error:','Startup error','Vehicle start failed','Audio frame error']) else None)
                return p
            page=new_page()
            try:
                page.goto(origin+'/tools/biomes/vegetation-preview-r11.html',wait_until='networkidle')
                report['sourceOracle']=page.evaluate(ORACLE,{'directory':json.loads((destination/'directory.json').read_text()),'base':origin+URL,
                    'plan':json.loads((pilot/'oracle-plan.json').read_text()),'expected':json.loads((pilot/'source-expectations.json').read_text())})
                page.close();requests.clear();page=new_page();page.goto(origin,wait_until='domcontentloaded')
                page.wait_for_selector('.v21VehicleChoice');page.locator('.v21VehicleChoice').first.click();page.locator('#v21StartButton').click()
                page.wait_for_function("document.getElementById('v21Startup').classList.contains('hidden')")
                assert page.evaluate(SNAP)['enabled'] is False and not requests
                assert page.evaluate('()=>__R9_WORKERS.filter(w=>w.url.includes("biome-preparation")).length')==0
                report['offNoWorkerOrData']=True
                page.evaluate("()=>document.getElementById('presetYungasBtn').click()")
                page.wait_for_function("WorldDriveFramePacing().rendering.routeKind==='road' && WorldDriveFramePacing().rendering.routePoints===1754 && document.getElementById('loading').classList.contains('hidden')")
                page.wait_for_function('WorldDriveFramePacing().rendering.groups.sceneryForest.instancedMeshes>=4')
                report['offBefore']=page.evaluate(R9.FRAMES,3000);page.screenshot(path=str(output/'yungas-off.png'))
                result=page.evaluate('async u=>(await import(u)).start()',URL+'start.mjs');assert result['pilot']=='r15-yungas-tropical'
                ready="()=>{const s=WorldDriveDiagnostics.forest.visualPilot.snapshot();if(s.phase==='fault')throw new Error(s.error);return s.modifiedChunks>=4 && s.proofsCompleted>=4;}"
                page.wait_for_function(ready);report['summer']=page.evaluate(SNAP)
                assert report['summer']['failures']==0 and report['summer']['error'] is None
                assert report['summer']['worker']['transport']['loaded']>0 and report['summer']['worker']['transport']['rejected']==0
                report['summerFrames']=page.evaluate(R9.FRAMES,3000);report['identity']=page.evaluate(CHECK)
                page.screenshot(path=str(output/'yungas-tropical.png'))
                # Observe rendering only after the controller has polled the new position.
                # This does not certify every visible chunk or a continuous driven lap.
                jumps=[]
                for percent in [25,75]:
                    before_state=page.evaluate(SNAP);before_polls=before_state['polls']
                    page.evaluate("p=>{const i=document.getElementById('jump');i.value=p;i.dispatchEvent(new Event('input'));document.getElementById('jumpBtn').click();WorldDriveDiagnostics.forest.visualPilot.refresh();}",percent)
                    page.wait_for_function("since=>{const s=WorldDriveDiagnostics.forest.visualPilot.snapshot();if(s.phase==='fault')throw new Error(s.error);return s.polls>=since.polls+2 && s.proofsCompleted>since.proofsCompleted && s.modifiedChunks>=4;}",arg=before_state)
                    jumps.append({'percent':percent,'snapshot':page.evaluate(SNAP),'audit':page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.audit()')})
                report['visibleAfterJumps']=jumps;page.screenshot(path=str(output/'yungas-after-jump.png'))
                page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.stop()');page.wait_for_timeout(750)
                count=len(requests);report['offAfter']=page.evaluate(R9.FRAMES,3000)
                assert len(requests)==count and page.evaluate(SNAP)['modifiedChunks']==0
                assert all(w['terminated'] for w in page.evaluate('()=>__R9_WORKERS') if 'biome-preparation' in w['url'])
                page.evaluate('async u=>(await import(u)).start()',URL+'start.mjs');page.wait_for_function(ready)
                report['routeReset']=page.evaluate("()=>{document.getElementById('presetNordschleifeBtn').click();return WorldDriveDiagnostics.forest.visualPilot.snapshot();}")
                assert report['routeReset']['enabled'] is False and report['routeReset']['modifiedChunks']==0
                assert all(w['terminated'] for w in page.evaluate('()=>__R9_WORKERS') if 'biome-preparation' in w['url'])
                assert not errors and not engine,(errors,engine)
                report.update(status='PASS',browser=browser.version,workers=page.evaluate('()=>__R9_WORKERS'))
            except Exception as error:
                report.update(status='FAIL',failure=str(error))
                try:
                    report['stalledPilot']=page.evaluate(SNAP);report['stalledFrame']=page.evaluate('()=>WorldDriveFramePacing()')
                    page.screenshot(path=str(output/'failure.png'))
                except Exception as capture:report['captureError']=str(capture)
                raise
            finally:context.close();browser.close()
    finally:
        report.update(pageErrors=errors,engineErrors=engine,pilotRequests=requests,upstreamRequests=dict(upstream),
            limitations=['Software rasterization, not user GPU or high-speed fluidity','External geographic services controlled; pale fallback ground is not snow',
                'Summer-only regional shape substitution, not species or elevation zonation','Mixed/non-444 chunks retain original forest; no source-boundary blending',
                'Parked samples and actual UI teleports, not a continuous driven lap'])
        (output/'rendered-yungas-r15-qa.json').write_text(json.dumps(report,indent=2)+'\n')
        if server:
            server.terminate()
            try:server.wait(timeout=10)
            except subprocess.TimeoutExpired:server.kill();server.wait()
        if log:log.close()
        (None if bundled else shutil.rmtree(destination))
    print(json.dumps({'status':report['status'],'oracleReads':report['sourceOracle']['reads'],'summerChunks':report['summer']['modifiedChunks']}))
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for name in ['pilot','output']:p.add_argument('--'+name,type=Path,required=True)
    a=p.parse_args();main(a.pilot.resolve(),a.output.resolve())

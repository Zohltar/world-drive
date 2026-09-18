#!/usr/bin/env python3
"""Real Vite + full Three driving game + native Worker, no runtime stubs.
Only external geographic providers return controlled failures; the authored
Nordschleife, R4 streamer, placement/exclusions and render pipeline are real.
Software-rendered measurements are NOT human GPU driving certification.
"""
import argparse
from collections import Counter
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
INSTALL=Path('public/local-data/biomes/pilot-r12')
URL='/local-data/biomes/pilot-r12/'
SNAP='() => WorldDriveDiagnostics.forest.visualPilot.snapshot()'
SPEC=importlib.util.spec_from_file_location('r12_r9_harness',ROOT/'qa/qa-block8-biome-fullgame-r9.py')
R9=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(R9)
SOURCE_CHECK=r'''async ({directory,base,plan,expected})=>{
 const {createBiomeWorkerClient}=await import('/src/scenery/biomes/biome-worker-client.js');
 const {createBiomeChunkContextBridge}=await import('/src/scenery/biomes/chunk-context-bridge.js');
 const {createForestCandidateAdapter,FOREST_LAYOUT_ID}=await import('/src/scenery/biomes/forest-candidate-adapter.js');
 const {createBiomeRoutePlan}=await import('/src/scenery/biomes/route-tile-plan.js');
 const {createR12Proof}=await import('/tools/biomes/rendered-pilot-policy-r12.mjs');
 const a=createForestCandidateAdapter({origin:plan.origin,routeId:'r12-oracle'}),rp=createBiomeRoutePlan(plan.coordinates),client=createBiomeWorkerClient();
 let bridge=null,reads=0,eligible=0,refused=0;const regions={};
 try{
  await client.initialize({directory,baseUrl:base});
  bridge=createBiomeChunkContextBridge({client,identity:directory,layoutId:FOREST_LAYOUT_ID,maxChunks:16});
  if((await bridge.setRoute(plan.coordinates,{projectionId:a.projectionId})).status!=='route-ready')throw new Error('oracle route');
  for(const sample of plan.samples){
   const update=await bridge.update(rp.distanceAtVertex(sample.anchorIndex),{aheadMeters:0,behindMeters:0,corridorMeters:2800,maxTiles:8});
   if(update.status!=='ready')throw new Error('oracle window '+sample.key);
   const r=await bridge.prepareForestChunk({cx:sample.cx,cz:sample.cz,origin:plan.origin,routeId:a.routeId});
   if(r.status!=='prepared')throw new Error('oracle chunk '+r.reason);
   const bytes=Uint8Array.from(atob(expected[sample.key]),c=>c.charCodeAt(0));const want=new DataView(bytes.buffer);
   let all=true;
   for(let i=0;i<1744;i++){
    const p=a.point(sample.cx,sample.cz,i),q=r.snapshot.lookup(i,p.lon,p.lat),id=q.ecoregion?.id??0;
    if(q.status==='unavailable'||id!==want.getUint16(i*2,true))throw new Error('source mismatch '+sample.key+'/'+i);
    regions[id]=(regions[id]??0)+1;all&&=id===686;reads++;
   }
   const proof=createR12Proof(r.snapshot,a,sample.cx,sample.cz);let step;
   do{step=proof.step();}while(!step.done);
   if(!!proof.result()!==all)throw new Error('homogeneous proof did not match source');
   if(all)eligible++;else refused++;
  }
  return {status:'PASS',chunks:plan.samples.length,reads,eligible,refused,regions,bridge:bridge.diagnostics(),worker:await client.diagnostics()};
 }finally{bridge?.dispose();client.dispose();}
}'''
COMPARE=r'''()=>{
 const api=WorldDriveDiagnostics.forest.visualPilot,before=api.audit();
 const sizes=before.meshes.map(x=>[x.key,x.count,x.matrixHash,x.matrixBytes]);
 const result=api.season('winter'),after=api.audit();
 if(JSON.stringify(sizes)!==JSON.stringify(after.meshes.map(x=>[x.key,x.count,x.matrixHash,x.matrixBytes])))throw new Error('Winter mutated counts or matrices');
 for(const m of after.meshes)if(m.model!=='preview-temperate-winter'||m.triangles!==114||m.baseTriangles!==68||m.proofCandidates!==1744||!m.geometryOnly)throw new Error('Invalid real winter mesh');
 for(let i=0;i<20;i++){api.season('summer');api.season('winter');}
 const last=api.audit();
 if(JSON.stringify(sizes)!==JSON.stringify(last.meshes.map(x=>[x.key,x.count,x.matrixHash,x.matrixBytes])))throw new Error('Season switching mutated placement');
 return {before,after,last,result};
}'''
def main(pilot,output):
    output.mkdir(parents=True,exist_ok=False)
    destination=ROOT/INSTALL
    if destination.exists():raise FileExistsError('Do not overwrite installed R12 data')
    shutil.copytree(pilot/INSTALL,destination)
    # Confirm the opt-in source graph also compiles in the actual production build.
    subprocess.run(['npm','run','build'],cwd=ROOT,check=True)
    with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
    origin=f'http://127.0.0.1:{port}'
    log=(output/'vite.log').open('w')
    server=subprocess.Popen(['node','node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',str(port),'--strictPort'],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
    report={'status':'RUNNING','fullGame':True,'realVite':True,'productionBuild':True,'runtimeStubs':False,'gpuPerformanceCertification':False}
    errors=[];engine=[];requests=[];upstream=Counter();page=None
    try:
      for i in range(100):
        try:
          with urllib.request.urlopen(origin,timeout=1) as r:
            if r.status==200:break
        except Exception:
          if server.poll() is not None:raise RuntimeError('Vite failed')
          time.sleep(.2)
      else:raise TimeoutError('Vite did not start')
      with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        context=browser.new_context(viewport={'width':1100,'height':700},device_scale_factor=1)
        context.add_init_script(R9.INSTRUMENT)
        def network(route):
            url=route.request.url;parsed=urllib.parse.urlparse(url)
            if url.startswith(origin+'/'):
                if URL in url:requests.append(parsed.path)
                return route.continue_()
            upstream[parsed.netloc]+=1
            headers={'Access-Control-Allow-Origin':'*'}
            if '/route/v1/driving/' in parsed.path:
                lon,lat=map(float,parsed.path.split('/driving/',1)[1].split(';')[0].split(','))
                fixture=[[lon,lat],[lon+.006,lat+.004],[lon+.012,lat+.008]]
                return route.fulfill(status=200,content_type='application/json',headers=headers,body=json.dumps({'code':'Ok','routes':[{'geometry':{'coordinates':fixture}}]}))
            return route.fulfill(status=503,content_type='text/plain',headers=headers,body='R12 upstream fixture')
        context.route('**/*',network)
        # An independent Worker comparison on actual polygons precedes game mutation tests.
        oracle_page=context.new_page();oracle_page.goto(origin+'/tools/biomes/vegetation-preview-r11.html',wait_until='networkidle')
        report['sourceOracle']=oracle_page.evaluate(SOURCE_CHECK,{'directory':json.loads((destination/'directory.json').read_text()),'base':origin+URL,
            'plan':json.loads((pilot/'oracle-plan.json').read_text()),'expected':json.loads((pilot/'source-expectations.json').read_text())})
        oracle_page.close();requests.clear()
        page=context.new_page();page.set_default_timeout(120000)
        page.on('pageerror',lambda e:errors.append(str(e)))
        def console(m):
            if any(x in m.text for x in ['Frame error:','Startup error','Vehicle start failed','Audio frame error']):engine.append(m.text[:1000])
        page.on('console',console)
        page.goto(origin,wait_until='domcontentloaded')
        page.wait_for_selector('.v21VehicleChoice');page.locator('.v21VehicleChoice').first.click();page.locator('#v21StartButton').click()
        page.wait_for_function("document.getElementById('v21Startup').classList.contains('hidden')")
        assert page.evaluate(SNAP)['enabled'] is False
        assert not requests,'Default game requested R12 data'
        assert page.evaluate('() => __R9_WORKERS.filter(w=>w.url.includes("biome-preparation")).length')==0
        report['offNoWorkerOrData']=True
        page.evaluate("() => document.getElementById('presetNordschleifeBtn').click()")
        page.wait_for_function("WorldDriveFramePacing().rendering.routeKind==='circuit' && WorldDriveFramePacing().rendering.routePoints===1068 && document.getElementById('loading').classList.contains('hidden')")
        page.wait_for_timeout(5000)
        report['offBefore']=page.evaluate(R9.FRAMES,3000)
        activation=page.evaluate("async u => (await import(u)).start({season:'summer'})",URL+'start.mjs')
        assert activation['status']=='enabled'
        page.wait_for_function("()=>{const s=WorldDriveDiagnostics.forest.visualPilot.snapshot();if(s.phase==='fault')throw new Error(s.error);return s.modifiedChunks>=4 && s.proofsCompleted>=4;}")
        report['summer']=page.evaluate(SNAP)
        assert report['summer']['error'] is None and report['summer']['failures']==0
        assert report['summer']['worker']['transport']['loaded']>0
        assert report['summer']['worker']['transport']['rejected']==0
        assert report['summer']['bridge']['peakChunks']<=16
        report['summerFrames']=page.evaluate(R9.FRAMES,3000)
        summer=page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.audit()')
        assert all(m['model']=='preview-temperate' and m['triangles']==60 and m['baseTriangles']==68 and m['proofCandidates']==1744 for m in summer['meshes'])
        page.screenshot(path=str(output/'nord-summer.png'))
        report['seasonIdentity']=page.evaluate(COMPARE)
        report['winterFrames']=page.evaluate(R9.FRAMES,3000)
        report['winter']=page.evaluate(SNAP);page.screenshot(path=str(output/'nord-winter.png'))
        # User-facing invalid input must not discard a currently working view.
        bad=page.evaluate("async u=>{try{await (await import(u)).start({season:'invalid'});return false;}catch{return WorldDriveDiagnostics.forest.visualPilot.snapshot().enabled;}}",URL+'start.mjs')
        assert bad is True
        page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.stop()');page.wait_for_timeout(750)
        count=len(requests);report['offAfter']=page.evaluate(R9.FRAMES,3000)
        assert len(requests)==count,'Stopped pilot requested more data'
        assert page.evaluate(SNAP)['modifiedChunks']==0
        assert all(w['terminated'] for w in page.evaluate('()=>__R9_WORKERS') if 'biome-preparation' in w['url'])
        # Existing UI teleport and route reset exercise actual renderer/cached chunks.
        page.evaluate("async u=>(await import(u)).start({season:'winter'})",URL+'start.mjs')
        page.wait_for_function('WorldDriveDiagnostics.forest.visualPilot.snapshot().modifiedChunks>=2')
        before=page.evaluate(SNAP)['proofsCompleted']
        page.evaluate("()=>{const i=document.getElementById('jump');i.value=50;i.dispatchEvent(new Event('input'));document.getElementById('jumpBtn').click();WorldDriveDiagnostics.forest.visualPilot.refresh();}")
        page.wait_for_function('n=>WorldDriveDiagnostics.forest.visualPilot.snapshot().proofsCompleted>n',arg=before)
        report['afterJump']=page.evaluate(SNAP)
        report['routeReset']=page.evaluate("()=>{document.getElementById('presetLagunaSecaBtn').click();return WorldDriveDiagnostics.forest.visualPilot.snapshot();}")
        assert report['routeReset']['enabled'] is False and report['routeReset']['modifiedChunks']==0
        assert all(w['terminated'] for w in page.evaluate('()=>__R9_WORKERS') if 'biome-preparation' in w['url'])
        assert not errors,errors;assert not engine,engine
        report.update(status='PASS',browser=browser.version,workers=page.evaluate('()=>__R9_WORKERS'))
        context.close();browser.close()
    except Exception as e:
        report.update(status='FAIL',failure=str(e))
        if page:
            try:
                report['last']=page.evaluate(SNAP);report['lastFrame']=page.evaluate('()=>WorldDriveFramePacing()');page.screenshot(path=str(output/'failure.png'))
            except Exception as capture:report['captureError']=str(capture)
        raise
    finally:
        report.update(pageErrors=errors,engineErrors=engine,pilotRequests=requests,upstreamRequests=dict(upstream),
            limitations=['Software-rendered Chromium, not user GPU/FPS certification','Real source context is not current tree cover or species identity',
            'Homogeneous Nordschleife chunks only; trees only; ground/road/weather unchanged','Parked sampling and an actual UI teleport, not continuous high-speed driving'])
        (output/'rendered-pilot-r12-qa.json').write_text(json.dumps(report,indent=2)+'\n')
        server.terminate()
        try:server.wait(timeout=10)
        except subprocess.TimeoutExpired:server.kill();server.wait()
        log.close();shutil.rmtree(destination)
    print(json.dumps({'status':report['status'],'oracle':report['sourceOracle']['reads'],'renderedChunks':report['summer']['modifiedChunks']}))
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--pilot',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    a=p.parse_args();main(a.pilot.resolve(),a.output.resolve())

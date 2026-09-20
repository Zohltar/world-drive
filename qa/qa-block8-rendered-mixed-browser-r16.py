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
LAUNCHER='/tools/biomes/mixed-pilot-launcher-r16.mjs'
SNAP='() => WorldDriveDiagnostics.forest.visualPilot.snapshot()'
SPEC=importlib.util.spec_from_file_location('r16_r9_harness',ROOT/'qa/qa-block8-biome-fullgame-r9.py')
R9=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(R9)
BASE_SPEC=importlib.util.spec_from_file_location('r16_source_check',ROOT/'qa/qa-block8-rendered-pilot-browser-r12.py')
BASE=importlib.util.module_from_spec(BASE_SPEC);BASE_SPEC.loader.exec_module(BASE)
SOURCE_CHECK=BASE.SOURCE_CHECK
COMPARE=r'''()=>{
 const api=WorldDriveDiagnostics.forest.visualPilot,before=api.audit();
 const ids=a=>a.meshes.map(m=>[m.key,m.count,m.matrixHash,m.matrixBytes]);
 const check=(a,winter)=>{for(const m of a.meshes){const x=m.mixed;
   if(!x?.sourcePrefixExact||!x.sourceGeometryUnchanged||!x.sourceAttributeUnchanged||!x.sourceMaterialUnchanged||!x.sourceHidden||m.proofCandidates!==1744)throw new Error('R16 source changed');
   if(x.parts.reduce((n,p)=>n+p.count,0)!==m.count||x.parts.length>2||x.callbacks<1)throw new Error('R16 source prefix or callback');
   const allowed=winter?['preview-temperate-winter','preview-conifer-winter']:['preview-temperate','preview-conifer'];
   if(!x.parts.every(p=>allowed.includes(p.model)))throw new Error('R16 model');
 }};
 check(before,false);api.season('winter');const after=api.audit();check(after,true);
 for(let i=0;i<20;i++){api.season('summer');api.season('winter');}
 const last=api.audit();check(last,true);
 if(JSON.stringify(ids(before))!==JSON.stringify(ids(after))||JSON.stringify(ids(before))!==JSON.stringify(ids(last)))throw new Error('R16 seasonal placement changed');
 return {before,after,last,roundTrips:20};
}'''
def main(pilot,output):
    output.mkdir(parents=True,exist_ok=False)
    destination=ROOT/INSTALL
    if destination.exists():raise FileExistsError('Do not overwrite installed R16 data')
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
        # Native visual sample: three proved chunks at 1100x700/DPR1 within 120 s.\n        # Full source coverage and exact 1,744-point proofs remain separate gates.
        # DPR 0.5 did not resolve sparse idle slots (077e still timed out).
        # R16 now fills the same 0.8 ms budget up to its bounded read cap;
        # neither timeout admission nor the certified R4 scheduler is changed.
        context=browser.new_context(viewport={'width':1100,'height':700},device_scale_factor=1)
        report['browserEnvironment']={'viewportCss':{'width':1100,'height':700},
            'deviceScaleFactor':1,'softwareRasterOnly':True,
            'originalTimeoutMs':120000,'requiredRenderedChunks':3}
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
            return route.fulfill(status=503,content_type='text/plain',headers=headers,body='R16 upstream fixture')
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
        assert not requests,'Default game requested R16 data'
        assert page.evaluate('() => __R9_WORKERS.filter(w=>w.url.includes("biome-preparation")).length')==0
        report['offNoWorkerOrData']=True
        page.evaluate("() => document.getElementById('presetNordschleifeBtn').click()")
        page.wait_for_function("WorldDriveFramePacing().rendering.routeKind==='circuit' && WorldDriveFramePacing().rendering.routePoints===1068 && document.getElementById('loading').classList.contains('hidden')")
        page.wait_for_function("WorldDriveFramePacing().rendering.groups.sceneryForest.instancedMeshes>=4")
        page.wait_for_timeout(5000)
        report['offBefore']=page.evaluate(R9.FRAMES,3000)
        activation=page.evaluate("async u => (await import(u)).start({season:'summer'})",LAUNCHER)
        assert activation['status']=='enabled' and activation['pilot']=='r16-nord-mixed'
        try:
            page.wait_for_function("()=>{const s=WorldDriveDiagnostics.forest.visualPilot.snapshot();if(s.phase==='fault')throw new Error(s.error);return s.modifiedChunks>=3 && s.proofsCompleted>=3;}")
        except Exception:
            # Capture before leaving Playwright's live event loop. Keep the original
            # three-chunk/120-second visual gate; missing progress is never a visual PASS.
            report['stalledPilot']=page.evaluate(SNAP)
            report['stalledFrame']=page.evaluate('()=>WorldDriveFramePacing()')
            print('R16 stalled pilot: '+json.dumps(report['stalledPilot']),flush=True)
            page.screenshot(path=str(output/'stalled-pilot.png'))
            raise
        report['summer']=page.evaluate(SNAP)
        assert report['summer']['error'] is None and report['summer']['failures']==0
        assert report['summer']['worker']['transport']['loaded']>0
        assert report['summer']['worker']['transport']['rejected']==0
        assert report['summer']['bridge']['peakChunks']<=16
        report['summerFrames']=page.evaluate(R9.FRAMES,3000)
        summer=page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.audit()')
        assert all(m.get('mixed',{}).get('sourcePrefixExact') and m['proofCandidates']==1744 for m in summer['meshes'])
        assert report['summer']['models'].get('preview-temperate',0)>0 and report['summer']['models'].get('preview-conifer',0)>0
        page.screenshot(path=str(output/'nord-mixed-summer.png'))
        report['seasonIdentity']=page.evaluate(COMPARE)
        report['winterFrames']=page.evaluate(R9.FRAMES,3000)
        report['winter']=page.evaluate(SNAP);page.screenshot(path=str(output/'nord-mixed-winter.png'))
        # User-facing invalid input must not discard a currently working view.
        bad=page.evaluate("async u=>{try{await (await import(u)).start({season:'invalid'});return false;}catch{return WorldDriveDiagnostics.forest.visualPilot.snapshot().enabled;}}",LAUNCHER)
        assert bad is True
        # A missing directory is rejected before touching the active presentation.
        page.route(origin+URL+'directory.json',lambda r:r.fulfill(status=404,body='missing'),times=1)
        assert page.evaluate("async u=>{try{await (await import(u)).start();return false;}catch{return WorldDriveDiagnostics.forest.visualPilot.snapshot().enabled;}}",LAUNCHER) is True
        report['missingDirectoryPreservesActive']=True
        page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.stop()');page.wait_for_timeout(750)
        count=len(requests);report['offAfter']=page.evaluate(R9.FRAMES,3000)
        assert len(requests)==count,'Stopped pilot requested more data'
        assert page.evaluate(SNAP)['modifiedChunks']==0
        assert all(w['terminated'] for w in page.evaluate('()=>__R9_WORKERS') if 'biome-preparation' in w['url'])
        # Existing UI teleport and route reset exercise actual renderer/cached chunks.
        page.evaluate("async u=>(await import(u)).start({season:'winter'})",LAUNCHER)
        page.wait_for_function('WorldDriveDiagnostics.forest.visualPilot.snapshot().modifiedChunks>=3')
        before=page.evaluate(SNAP)
        page.evaluate("()=>{const i=document.getElementById('jump');i.value=50;i.dispatchEvent(new Event('input'));document.getElementById('jumpBtn').click();WorldDriveDiagnostics.forest.visualPilot.refresh();}")
        page.wait_for_function('n=>{const s=WorldDriveDiagnostics.forest.visualPilot.snapshot();return s.proofsCompleted>n.proofsCompleted&&s.polls>=n.polls+2&&s.modifiedChunks>=3;}',arg=before)
        report['afterJump']=page.evaluate(SNAP);report['afterJumpAudit']=page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.audit()')
        assert all(m['mixed']['sourcePrefixExact'] for m in report['afterJumpAudit']['meshes'])
        page.screenshot(path=str(output/'nord-mixed-after-jump.png'))
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
            limitations=['Software-rendered Chromium at original DPR 1; not user GPU/FPS certification','Real source context is not current tree cover or species identity',
            'Mixture only inside fully source-qualified Nordschleife chunks; 3:1 artistic weight, not local species composition','Parked sampling and an actual UI teleport, not continuous high-speed driving','Up to two visible mesh passes per proved chunk instead of one; no claim of zero GPU cost'])
        (output/'rendered-pilot-r16-qa.json').write_text(json.dumps(report,indent=2)+'\n')
        server.terminate()
        try:server.wait(timeout=10)
        except subprocess.TimeoutExpired:server.kill();server.wait()
        log.close();shutil.rmtree(destination)
    print(json.dumps({'status':report['status'],'oracle':report['sourceOracle']['reads'],'renderedChunks':report['summer']['modifiedChunks']}))
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--pilot',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    a=p.parse_args();main(a.pilot.resolve(),a.output.resolve())

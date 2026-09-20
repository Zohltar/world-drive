#!/usr/bin/env python3
"""Native full-game R14 versus R19 dry Laguna presentation.
Uses real Vite/Three game + native biome Worker. External geographic providers
are controlled. This is visual/runtime evidence, not user-GPU certification.
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
INSTALL=Path('public/local-data/biomes/pilot-r14')
URL='/local-data/biomes/pilot-r14/'
REFERENCE=URL+'start.mjs'
LAUNCHER='/tools/biomes/dry-pilot-launcher-r19.mjs'
SNAP='()=>WorldDriveDiagnostics.forest.visualPilot.snapshot()'
spec=importlib.util.spec_from_file_location('r19_r9',ROOT/'qa/qa-block8-biome-fullgame-r9.py')
R9=importlib.util.module_from_spec(spec);spec.loader.exec_module(R9)
network_spec=importlib.util.spec_from_file_location('r19_network',ROOT/'qa/qa-block8-rendered-manic-network-r13.py')
NETWORK=importlib.util.module_from_spec(network_spec);network_spec.loader.exec_module(NETWORK)

def main(pilot,output):
    output.mkdir(parents=True,exist_ok=False);destination=ROOT/INSTALL
    if destination.exists():raise FileExistsError('Do not overwrite installed R14 data')
    shutil.copytree(pilot/INSTALL,destination)
    log=None;server=None;errors=[];engine=[];requests=[];upstream=Counter()
    report={'status':'RUNNING','realVite':True,'fullGame':True,'runtimeStubs':False,'gpuPerformanceCertification':False,
        'browserEnvironment':{'width':1100,'height':700,'deviceScaleFactor':1,'requiredRenderedChunks':4,'timeoutMs':120000}}
    try:
        subprocess.run(['npm','run','build'],cwd=ROOT,check=True);report['productionBuild']=True
        with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
        origin=f'http://127.0.0.1:{port}';log=(output/'vite.log').open('w')
        server=subprocess.Popen(['node','node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',str(port),'--strictPort'],
            cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
        for _ in range(100):
            try:
                with urllib.request.urlopen(origin,timeout=1) as r:
                    if r.status==200:break
            except Exception:
                if server.poll() is not None:raise RuntimeError('Vite failed')
                time.sleep(.2)
        else:raise TimeoutError('Vite startup')
        manic_fixture=gzip.decompress((ROOT/'qa/fixtures/biomes/manic-r10/response.json.gz').read_bytes())
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
                if NETWORK.is_manic_route_request(url):return route.fulfill(status=200,content_type='application/json',headers=headers,body=manic_fixture)
                return route.fulfill(status=503,content_type='text/plain',headers=headers,body='R19 controlled geographic fixture')
            context.route('**/*',network)
            page=context.new_page();page.set_default_timeout(120000)
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('console',lambda m:engine.append(m.text[:1000]) if any(x in m.text for x in
                ['Frame error:','Startup error','Vehicle start failed','Audio frame error','THREE.WebGLProgram','GL_INVALID_OPERATION']) else None)
            try:
                page.goto(origin,wait_until='domcontentloaded')
                page.wait_for_selector('.v21VehicleChoice');page.locator('.v21VehicleChoice').first.click();page.locator('#v21StartButton').click()
                page.wait_for_function("document.getElementById('v21Startup').classList.contains('hidden')")
                assert page.evaluate(SNAP)['enabled'] is False
                page.evaluate("()=>document.getElementById('presetLagunaSecaBtn').click()")
                page.wait_for_function("WorldDriveFramePacing().rendering.routeKind==='circuit' && WorldDriveFramePacing().rendering.routePoints===206 && document.getElementById('loading').classList.contains('hidden')")
                page.wait_for_function("WorldDriveFramePacing().rendering.groups.sceneryForest.instancedMeshes>=4")
                report['offBefore']=page.evaluate(R9.FRAMES,3000)
                # Accepted R14 is the same-game reference.
                ref=page.evaluate("async u=>(await import(u)).start()",REFERENCE);assert ref['pilot']=='r14-laguna-woodland'
                page.wait_for_function("()=>{const s=WorldDriveDiagnostics.forest.visualPilot.snapshot();if(s.phase==='fault')throw new Error(s.error);return s.modifiedChunks>=4&&s.proofsCompleted>=4;}")
                report['referenceR14']=page.evaluate(SNAP);report['referenceR14Audit']=page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.audit()')
                assert set(report['referenceR14']['models'])=={'preview-woodland'}
                page.screenshot(path=str(output/'laguna-r14-reference.png'))
                page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.stop()');page.wait_for_timeout(400)
                # New dry presentation.
                start=page.evaluate("async u=>(await import(u)).start()",LAUNCHER)
                assert start['status']=='enabled' and start['pilot']=='r19-laguna-dry'
                page.wait_for_function("()=>{const s=WorldDriveDiagnostics.forest.visualPilot.snapshot();if(s.phase==='fault')throw new Error(s.error);return s.pilot==='r19-laguna-dry'&&s.modifiedChunks>=4&&s.proofsCompleted>=4;}")
                summer=page.evaluate(SNAP);audit=page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.audit()')
                report['summer']=summer;report['summerAudit']=audit
                assert summer['error'] is None and summer['failures']==0 and summer['presentation']=='dry-r19'
                assert summer['dryClimateAssets']['id']=='dry-r19' and summer['dryClimateAssets']['triangles']==[44,64,50]
                assert summer['worker']['transport']['loaded']>0 and summer['worker']['transport']['rejected']==0
                for key in ['dry-woodland','dry-scrub','prickly-pear']:assert summer['models'].get(key,0)>0,key
                assert summer['potentialAdditionalDrawCalls']<=summer['modifiedChunks']*2
                for m in audit['meshes']:
                    d=m.get('mixed');assert d and d['sourcePrefixExact'] and d['sourceHidden']
                    assert len(d['parts'])==3 and sum(p['count'] for p in d['parts'])==m['count']
                report['summerFrames']=page.evaluate(R9.FRAMES,3000)
                page.screenshot(path=str(output/'laguna-r19-dry.png'))
                # Unsupported winter must leave the active dry view intact.
                before_state=page.evaluate(SNAP)
                preserved=page.evaluate("""()=>{const api=WorldDriveDiagnostics.forest.visualPilot;try{api.season('winter');return false;}catch{const s=api.snapshot();return s.enabled&&s.presentation==='dry-r19'&&s.error===null;}}""")
                after_state=page.evaluate(SNAP);after_audit=page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.audit()')
                assert preserved and after_state['enabled'] and after_state['presentation']=='dry-r19'
                assert after_state['failures']==before_state['failures'] and after_state['ownerConflicts']==before_state['ownerConflicts']
                assert after_state['modifiedChunks']>0 and all(after_state['models'].get(k,0)>0 for k in ['dry-woodland','dry-scrub','prickly-pear'])
                assert all(m.get('mixed',{}).get('sourcePrefixExact') for m in after_audit['meshes'])
                # Actual game teleports exercise prefix/ownership turnover.
                jumps=[]
                for percent in [25,75]:
                    state=page.evaluate(SNAP)
                    page.evaluate("p=>{const i=document.getElementById('jump');i.value=p;i.dispatchEvent(new Event('input'));document.getElementById('jumpBtn').click();WorldDriveDiagnostics.forest.visualPilot.refresh();}",percent)
                    page.wait_for_function("since=>{const s=WorldDriveDiagnostics.forest.visualPilot.snapshot();if(s.phase==='fault')throw new Error(s.error);return s.polls>=since.polls+2&&s.modifiedChunks>=4;}",arg=state)
                    jumps.append({'percent':percent,'snapshot':page.evaluate(SNAP),'audit':page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.audit()')})
                report['afterJumps']=jumps;page.screenshot(path=str(output/'laguna-r19-after-jump.png'))
                page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.stop()');page.wait_for_timeout(750)
                report['offAfter']=page.evaluate(SNAP);assert report['offAfter']['modifiedChunks']==0
                assert all(w['terminated'] for w in page.evaluate('()=>__R9_WORKERS') if 'biome-preparation' in w['url'])
                # Route reset also cleans a live R19 owner.
                page.evaluate("async u=>(await import(u)).start()",LAUNCHER)
                page.wait_for_function("WorldDriveDiagnostics.forest.visualPilot.snapshot().modifiedChunks>=2")
                report['routeReset']=page.evaluate("()=>{document.getElementById('presetNordschleifeBtn').click();return WorldDriveDiagnostics.forest.visualPilot.snapshot();}")
                assert report['routeReset']['enabled'] is False and report['routeReset']['modifiedChunks']==0
                assert not errors and not engine,(errors,engine)
                report.update(status='PASS',browser=browser.version,workers=page.evaluate('()=>__R9_WORKERS'),pilotRequests=requests)
            except Exception as error:
                report.update(status='FAIL',failure=str(error))
                try:
                    report['stalledPilot']=page.evaluate(SNAP);report['stalledFrame']=page.evaluate('()=>WorldDriveFramePacing()')
                    page.screenshot(path=str(output/'failure.png'))
                except Exception as capture:report['captureError']=str(capture)
                raise
            finally:context.close();browser.close()
    finally:
        report.update(pageErrors=errors,engineErrors=engine,upstreamRequests=dict(upstream),
            limitations=['Software-rendered Chromium, not user GPU/high-speed certification',
                'R19 changes vegetation presentation only; ground/road/weather are unchanged',
                'Dry woodland/scrub/cactus ratios are artistic, not a measured Laguna species inventory',
                'Existing R4 roots are repartitioned; no new ecological placement authority'])
        (output/'dry-laguna-r19-qa.json').write_text(json.dumps(report,indent=2)+'\n')
        if server:
            server.terminate()
            try:server.wait(timeout=10)
            except subprocess.TimeoutExpired:server.kill();server.wait()
        if log:log.close()
        shutil.rmtree(destination)
    print(json.dumps({'status':report['status'],'summerChunks':report['summer']['modifiedChunks'],'models':report['summer']['models']}))
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--pilot',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    a=p.parse_args();main(a.pilot.resolve(),a.output.resolve())

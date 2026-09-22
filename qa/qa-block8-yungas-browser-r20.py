#!/usr/bin/env python3
"""Native full-game R15 versus research-calibrated R20 Bolivian Yungas presentation.
Uses real Vite/Three game + native biome Worker. External geographic providers are
controlled. This is visual/runtime evidence, not altitude zonation or user-GPU certification.
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
REFERENCE=URL+'start.mjs'
LAUNCHER='/tools/biomes/humid-montane-pilot-launcher-r20.mjs'
SNAP='()=>WorldDriveDiagnostics.forest.visualPilot.snapshot()'
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
R9=load('r20_r9',ROOT/'qa/qa-block8-biome-fullgame-r9.py')
NETWORK=load('r20_network',ROOT/'qa/qa-block8-rendered-manic-network-r13.py')
YUNGAS=load('r20_yungas_network',ROOT/'qa/qa-block8-rendered-yungas-network-r15.py')

def main(pilot,output):
    output.mkdir(parents=True,exist_ok=False);destination=ROOT/INSTALL
    if destination.exists():raise FileExistsError('Do not overwrite installed R15 data')
    shutil.copytree(pilot/INSTALL,destination)
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
        manic_fixture=gzip.decompress((ROOT/'qa/fixtures/biomes/manic-r10/response.json.gz').read_bytes())
        with sync_playwright() as pw:
            browser=pw.chromium.launch(headless=True,args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
            context=browser.new_context(viewport={'width':1100,'height':700},device_scale_factor=1);context.add_init_script(R9.INSTRUMENT)
            def network(route):
                url=route.request.url;parsed=urllib.parse.urlsplit(url)
                if url.startswith(origin+'/'):
                    if URL in url:requests.append(parsed.path)
                    return route.continue_()
                upstream[parsed.netloc]+=1;headers={'Access-Control-Allow-Origin':'*'}
                if NETWORK.is_manic_route_request(url):return route.fulfill(status=200,content_type='application/json',headers=headers,body=manic_fixture)
                if YUNGAS.is_yungas_route_request(url):return route.fulfill(status=200,content_type='application/json',headers=headers,body=yungas_fixture)
                return route.fulfill(status=503,content_type='text/plain',headers=headers,body='R20 controlled geographic fixture')
            context.route('**/*',network)
            page=context.new_page();page.set_default_timeout(120000)
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('console',lambda m:engine.append(m.text[:1000]) if any(x in m.text for x in ['Frame error:','Startup error','Vehicle start failed','Audio frame error','THREE.WebGLProgram','GL_INVALID_OPERATION']) else None)
            try:
                page.goto(origin,wait_until='domcontentloaded');page.wait_for_selector('.v21VehicleChoice');page.locator('.v21VehicleChoice').first.click();page.locator('#v21StartButton').click()
                page.wait_for_function("document.getElementById('v21Startup').classList.contains('hidden')");assert page.evaluate(SNAP)['enabled'] is False
                page.evaluate("()=>document.getElementById('presetYungasBtn').click()")
                page.wait_for_function("WorldDriveFramePacing().rendering.routeKind==='road' && WorldDriveFramePacing().rendering.routePoints===1754 && document.getElementById('loading').classList.contains('hidden')")
                page.wait_for_function('WorldDriveFramePacing().rendering.groups.sceneryForest.instancedMeshes>=4');report['offBefore']=page.evaluate(R9.FRAMES,3000)
                # R15 is the same-route accepted broad tropical reference.
                ref=page.evaluate("async u=>(await import(u)).start()",REFERENCE);assert ref['pilot']=='r15-yungas-tropical'
                ready_ref="()=>{const s=WorldDriveDiagnostics.forest.visualPilot.snapshot();if(s.phase==='fault')throw new Error(s.error);return s.modifiedChunks>=4&&s.proofsCompleted>=4;}"
                page.wait_for_function(ready_ref);report['referenceR15']=page.evaluate(SNAP);report['referenceR15Audit']=page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.audit()')
                assert set(report['referenceR15']['models'])=={'preview-tropical'};page.screenshot(path=str(output/'yungas-r15-reference.png'))
                page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.stop()');page.wait_for_timeout(400)
                start=page.evaluate("async u=>(await import(u)).start()",LAUNCHER);assert start['status']=='enabled' and start['pilot']=='r20-yungas-humid-montane'
                page.wait_for_function("()=>{const s=WorldDriveDiagnostics.forest.visualPilot.snapshot();if(s.phase==='fault')throw new Error(s.error);return s.pilot==='r20-yungas-humid-montane'&&s.modifiedChunks>=4&&s.proofsCompleted>=4;}")
                summer=page.evaluate(SNAP);audit=page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.audit()');report['summer']=summer;report['summerAudit']=audit
                assert summer['error'] is None and summer['failures']==0 and summer['presentation']=='humid-montane-r20'
                assert summer['humidMontaneAssets']['id']=='humid-montane-r20' and summer['humidMontaneAssets']['triangles']==[196,252,1052,96]
                assert summer['humidMontaneAssets']['mix']['measuredHabitatPercent'] is False and summer['humidMontaneAssets']['mix']['altitudeZonation'] is False and summer['humidMontaneAssets']['mix']['treeFernVisualWeight']==20
                assert summer['humidMontaneAssets']['treeFernSilhouette']['height']>=1.03 and summer['humidMontaneAssets']['treeFernSilhouette']['diameterX']>=1.9 and summer['humidMontaneAssets']['treeFernSilhouette']['diameterZ']>=1.9 and summer['humidMontaneAssets']['treeFernSilhouette']['fronds']==20 and summer['humidMontaneAssets']['treeFernSilhouette']['segments']==9 and summer['humidMontaneAssets']['treeFernSilhouette']['pinnae']==320 and summer['humidMontaneAssets']['treeFernSilhouette']['pinnaNearCrownFullWidth']>=.24 and summer['humidMontaneAssets']['treeFernSilhouette']['pinnaOuterFullWidth']>=.21
                assert summer['worker']['transport']['loaded']>0 and summer['worker']['transport']['rejected']==0
                for key in ['humid-montane-broadleaf','epiphyte-cloud-tree','tree-fern','bamboo-clump']:assert summer['models'].get(key,0)>0,key
                assert summer['models']['tree-fern']>=max(150,int(summer['modifiedInstances']*.14))
                assert summer['potentialAdditionalDrawCalls']<=summer['modifiedChunks']*3
                for m in audit['meshes']:
                    d=m.get('mixed');assert d and d['sourcePrefixExact'] and d['sourceHidden'] and m['proofCandidates']==1744 and m['ecoregion']==444
                    assert len(d['parts'])==4 and sum(p['count'] for p in d['parts'])==m['count']
                report['summerFrames']=page.evaluate(R9.FRAMES,3000);page.screenshot(path=str(output/'yungas-r20-humid-montane.png'))
                before_state=page.evaluate(SNAP)
                preserved=page.evaluate("""()=>{const api=WorldDriveDiagnostics.forest.visualPilot;try{api.season('winter');return false;}catch{const s=api.snapshot();return s.enabled&&s.presentation==='humid-montane-r20'&&s.error===null;}}""")
                after_state=page.evaluate(SNAP);after_audit=page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.audit()')
                assert preserved and after_state['failures']==before_state['failures'] and after_state['ownerConflicts']==before_state['ownerConflicts']
                assert all(m.get('mixed',{}).get('sourcePrefixExact') for m in after_audit['meshes'])
                jumps=[]
                for percent in [25,75]:
                    state=page.evaluate(SNAP);page.evaluate("p=>{const i=document.getElementById('jump');i.value=p;i.dispatchEvent(new Event('input'));document.getElementById('jumpBtn').click();WorldDriveDiagnostics.forest.visualPilot.refresh();}",percent)
                    # Cached/proved destinations do not guarantee two fresh controller
                    # polls or four simultaneously resident chunks under SwiftShader.
                    # Require a substantial ecological presentation to be visible.
                    page.wait_for_function("""()=>{const s=WorldDriveDiagnostics.forest.visualPilot.snapshot();if(s.phase==='fault')throw new Error(s.error);const ids=['humid-montane-broadleaf','epiphyte-cloud-tree','tree-fern','bamboo-clump'];return s.enabled&&s.presentation==='humid-montane-r20'&&s.error===null&&s.modifiedChunks>=2&&s.modifiedInstances>=1000&&ids.every(id=>(s.models[id]??0)>0)&&(s.models['tree-fern']??0)>=Math.floor(s.modifiedInstances*.14);}""")
                    after=page.evaluate(SNAP);jump_audit=page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.audit()')
                    assert after['failures']==state['failures'] and after['ownerConflicts']==state['ownerConflicts'] and after['modifiedChunks']>=2 and after['modifiedInstances']>=1000
                    assert jump_audit['meshes'] and all(m.get('mixed',{}).get('sourcePrefixExact') for m in jump_audit['meshes'])
                    jumps.append({'percent':percent,'snapshot':after,'audit':jump_audit})
                report['afterJumps']=jumps;page.screenshot(path=str(output/'yungas-r20-after-jump.png'))
                page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.stop()');page.wait_for_timeout(750);report['offAfter']=page.evaluate(SNAP);assert report['offAfter']['modifiedChunks']==0
                assert all(w['terminated'] for w in page.evaluate('()=>__R9_WORKERS') if 'biome-preparation' in w['url'])
                page.evaluate("async u=>(await import(u)).start()",LAUNCHER);page.wait_for_function("WorldDriveDiagnostics.forest.visualPilot.snapshot().modifiedChunks>=2")
                report['routeReset']=page.evaluate("()=>{document.getElementById('presetNordschleifeBtn').click();return WorldDriveDiagnostics.forest.visualPilot.snapshot();}")
                assert report['routeReset']['enabled'] is False and report['routeReset']['modifiedChunks']==0
                assert not errors and not engine,(errors,engine);report.update(status='PASS',browser=browser.version,workers=page.evaluate('()=>__R9_WORKERS'),pilotRequests=requests)
            except Exception as error:
                report.update(status='FAIL',failure=str(error))
                try:report['stalledPilot']=page.evaluate(SNAP);report['stalledFrame']=page.evaluate('()=>WorldDriveFramePacing()');page.screenshot(path=str(output/'failure.png'))
                except Exception as capture:report['captureError']=str(capture)
                raise
            finally:context.close();browser.close()
    finally:
        report.update(pageErrors=errors,engineErrors=engine,upstreamRequests=dict(upstream),limitations=[
            'Software-rendered Chromium, not user GPU/high-speed certification',
            'R20 is regional humid-montane physiognomy, not exact species abundance or present-day land cover',
            'No altitude zonation is claimed; broadleaf, epiphyte, tree-fern and bamboo cues are all supported in Bolivian Yungas sources',
            'Existing R4 roots/transforms are repartitioned; no new ecological placement authority'])
        (output/'yungas-r20-qa.json').write_text(json.dumps(report,indent=2)+'\n')
        if server:
            server.terminate()
            try:server.wait(timeout=10)
            except subprocess.TimeoutExpired:server.kill();server.wait()
        if log:log.close()
        shutil.rmtree(destination)
    print(json.dumps({'status':report['status'],'summerChunks':report['summer']['modifiedChunks'],'models':report['summer']['models']}))
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--pilot',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();main(a.pilot.resolve(),a.output.resolve())

#!/usr/bin/env python3
"""Native full-game R13 reference versus research-calibrated R21 Manic boreal diversity.
Uses real Vite/Three game + native biome Worker with controlled geographic HTTP.
This is visual/runtime evidence, not user-GPU or continuous 191 km certification.
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
INSTALL=Path('public/local-data/biomes/pilot-r13')
URL='/local-data/biomes/pilot-r13/'
REFERENCE=URL+'start.mjs'
LAUNCHER='/tools/biomes/boreal-pilot-launcher-r21.mjs'
SNAP='()=>WorldDriveDiagnostics.forest.visualPilot.snapshot()'
spec=importlib.util.spec_from_file_location('r21_r9',ROOT/'qa/qa-block8-biome-fullgame-r9.py')
R9=importlib.util.module_from_spec(spec);spec.loader.exec_module(R9)
network_spec=importlib.util.spec_from_file_location('r21_network',ROOT/'qa/qa-block8-rendered-manic-network-r13.py')
NETWORK=importlib.util.module_from_spec(network_spec);network_spec.loader.exec_module(NETWORK)

def main(pilot,output):
    output.mkdir(parents=True,exist_ok=False);destination=ROOT/INSTALL
    if destination.exists():raise FileExistsError('Do not overwrite installed R13 data')
    shutil.copytree(pilot/INSTALL,destination)
    log=None;server=None;errors=[];engine=[];requests=[];upstream=Counter()
    report={'status':'RUNNING','realVite':True,'fullGame':True,'runtimeStubs':False,'gpuPerformanceCertification':False,
        'browserEnvironment':{'width':1100,'height':700,'deviceScaleFactor':1,'requiredRenderedChunks':3,'timeoutMs':120000}}
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
                if NETWORK.is_manic_route_request(url):return route.fulfill(status=200,content_type='application/json',headers=headers,body=route_fixture)
                return route.fulfill(status=503,content_type='text/plain',headers=headers,body='R21 controlled geographic fixture')
            context.route('**/*',network)
            page=context.new_page();page.set_default_timeout(120000)
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('console',lambda m:engine.append(m.text[:1000]) if any(x in m.text for x in ['Frame error:','Startup error','Vehicle start failed','Audio frame error','THREE.WebGLProgram','GL_INVALID_OPERATION']) else None)
            try:
                page.goto(origin+'/?r24AutoBiomes=1',wait_until='domcontentloaded');page.wait_for_selector('.v21VehicleChoice')
                page.locator('.v21VehicleChoice').first.click();page.locator('#v21StartButton').click()
                page.wait_for_function("document.getElementById('v21Startup').classList.contains('hidden')")
                page.wait_for_function("WorldDriveFramePacing().rendering.routeKind==='road' && WorldDriveFramePacing().rendering.routePoints===1497 && document.getElementById('loading').classList.contains('hidden')")
                page.wait_for_function('WorldDriveFramePacing().rendering.groups.sceneryForest.instancedMeshes>=4')
                page.wait_for_function("()=>{const s=WorldDriveDiagnostics.forest.visualPilot.snapshot();return s.enabled&&s.pilot==='r21-manic-boreal-diversity'&&s.error===null&&s.modifiedChunks>=1;}")
                report['r24Auto']=page.evaluate(SNAP);report['r24AutoController']=page.evaluate("()=>WorldDriveDiagnostics.forest.defaultBiomes.snapshot()")
                assert report['r24AutoController']['phase']=='active' and report['r24AutoController']['routeId']=='manic' and report['r24AutoController']['pilot']=='r21-manic-boreal-diversity'
                page.evaluate("()=>{globalThis.__WORLD_DRIVE_DISABLE_DEFAULT_BIOMES__=true;WorldDriveDiagnostics.forest.visualPilot.stop();}");page.wait_for_timeout(400);requests.clear()
                report['offBefore']=page.evaluate(R9.FRAMES,3000)
                # Exact accepted R13 is the in-game reference.
                ref=page.evaluate("async u=>(await import(u)).start({season:'summer'})",REFERENCE);assert ref['pilot']=='r13-manic-boreal'
                page.wait_for_function("()=>{const s=WorldDriveDiagnostics.forest.visualPilot.snapshot();if(s.phase==='fault')throw new Error(s.error);return s.modifiedChunks>=4&&s.proofsCompleted>=4;}")
                report['referenceR13']=page.evaluate(SNAP);report['referenceR13Audit']=page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.audit()')
                assert set(report['referenceR13']['models'])=={'preview-conifer'}
                page.screenshot(path=str(output/'manic-r13-reference.png'))
                page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.stop()');page.wait_for_timeout(400)
                # New ecological Manic presentation.
                start=page.evaluate("async u=>(await import(u)).start({season:'summer'})",LAUNCHER)
                assert start['status']=='enabled' and start['pilot']=='r21-manic-boreal-diversity'
                page.wait_for_function("""()=>{const s=WorldDriveDiagnostics.forest.visualPilot.snapshot();if(s.phase==='fault')throw new Error(s.error);const ids=['black-spruce','balsam-fir','paper-birch','trembling-aspen'];return s.pilot==='r21-manic-boreal-diversity'&&s.modifiedChunks>=3&&s.proofsCompleted>=4&&s.modifiedInstances>=2000&&ids.every(id=>(s.models[id]??0)>0);}""")
                summer=page.evaluate(SNAP);audit=page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.audit()')
                report['summer']=summer;report['summerAudit']=audit
                assert summer['error'] is None and summer['failures']==0 and summer['presentation']=='boreal-diversity-r21'
                assert summer['borealAssets']['id']=='boreal-diversity-r21' and summer['borealAssets']['mix']['measuredHabitatPercent'] is False
                assert summer['worker']['transport']['loaded']>0 and summer['worker']['transport']['rejected']==0
                for key in ['black-spruce','balsam-fir','paper-birch','trembling-aspen']:assert summer['models'].get(key,0)>0,key
                assert summer['potentialAdditionalDrawCalls']<=summer['modifiedChunks']*3
                for m in audit['meshes']:
                    d=m.get('mixed');assert d and d['sourcePrefixExact'] and d['sourceHidden'] and d['season']=='summer'
                    assert len(d['parts'])==4 and sum(p['count'] for p in d['parts'])==m['count']
                report['summerFrames']=page.evaluate(R9.FRAMES,3000);page.screenshot(path=str(output/'manic-r21-summer.png'))
                # Winter changes silhouettes only, never roots/counts.
                summer_by_key={m['key']:{p['id']:p['count'] for p in m['mixed']['parts']} for m in audit['meshes']}
                page.evaluate("()=>WorldDriveDiagnostics.forest.visualPilot.season('winter')");page.wait_for_timeout(600)
                winter=page.evaluate(SNAP);winter_audit=page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.audit()')
                report['winter']=winter;report['winterAudit']=winter_audit
                assert winter['season']=='winter' and winter['failures']==0 and winter['ownerConflicts']==0
                assert sum(winter['models'].values())==winter['modifiedInstances'] and all(winter['models'].get(k,0)>0 for k in ['black-spruce','balsam-fir','paper-birch','trembling-aspen'])
                winter_by_key={m['key']:{p['id']:p['count'] for p in m['mixed']['parts']} for m in winter_audit['meshes']}
                common=set(summer_by_key)&set(winter_by_key);assert common and all(winter_by_key[k]==summer_by_key[k] for k in common)
                assert all(m.get('mixed',{}).get('sourcePrefixExact') and m['mixed'].get('season')=='winter' for m in winter_audit['meshes'])
                summer_tri={p['id']:p['triangles'] for m in audit['meshes'] for p in m['mixed']['parts']}
                winter_tri={p['id']:p['triangles'] for m in winter_audit['meshes'] for p in m['mixed']['parts']}
                assert summer_tri!=winter_tri
                report['winterFrames']=page.evaluate(R9.FRAMES,3000);page.screenshot(path=str(output/'manic-r21-winter.png'))
                # Repeated seasonal ownership remains exact.
                for _ in range(10):
                    page.evaluate("()=>WorldDriveDiagnostics.forest.visualPilot.season('summer')")
                    page.evaluate("()=>WorldDriveDiagnostics.forest.visualPilot.season('winter')")
                assert all(m.get('mixed',{}).get('sourcePrefixExact') for m in page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.audit()')['meshes'])
                page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.stop()');page.wait_for_timeout(750)
                report['offAfter']=page.evaluate(SNAP);assert report['offAfter']['modifiedChunks']==0
                assert all(w['terminated'] for w in page.evaluate('()=>__R9_WORKERS') if 'biome-preparation' in w['url'])
                # Actual route reset cleans a live R21 owner.
                page.evaluate("async u=>(await import(u)).start({season:'winter'})",LAUNCHER)
                page.wait_for_function('WorldDriveDiagnostics.forest.visualPilot.snapshot().modifiedChunks>=2')
                report['routeReset']=page.evaluate("()=>{document.getElementById('presetNordschleifeBtn').click();return WorldDriveDiagnostics.forest.visualPilot.snapshot();}")
                assert report['routeReset']['enabled'] is False and report['routeReset']['modifiedChunks']==0
                assert not errors and not engine,(errors,engine)
                report.update(status='PASS',browser=browser.version,workers=page.evaluate('()=>__R9_WORKERS'),pilotRequests=requests)
            except Exception as error:
                report.update(status='FAIL',failure=str(error))
                try:
                    report['stalledPilot']=page.evaluate(SNAP);report['stalledFrame']=page.evaluate('()=>WorldDriveFramePacing()');page.screenshot(path=str(output/'failure.png'))
                except Exception as capture:report['captureError']=str(capture)
                raise
            finally:context.close();browser.close()
    finally:
        report.update(pageErrors=errors,engineErrors=engine,upstreamRequests=dict(upstream),
            limitations=['Software-rendered Chromium, not user GPU/high-speed certification',
                'R21 changes tree-family presentation only; ground moss/lichen, terrain, road, weather and grip are unchanged',
                'Spruce/fir/birch/aspen visual weights are not measured local species percentages',
                'Existing R4 roots are repartitioned; no new ecological placement or altitude authority'])
        (output/'boreal-manic-r21-qa.json').write_text(json.dumps(report,indent=2)+'\n')
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

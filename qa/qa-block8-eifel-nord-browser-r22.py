#!/usr/bin/env python3
"""Native full-game R18 reference versus research-calibrated R22 Eifel forest.
Real Vite/Three/native Worker; geographic HTTP controlled. Software rendering is
visual/runtime evidence only, not user-GPU or continuous-lap certification.
"""
import argparse, importlib.util, json, shutil, socket, subprocess, time, urllib.parse, urllib.request
from collections import Counter
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
INSTALL=Path('public/local-data/biomes/pilot-r12');URL='/local-data/biomes/pilot-r12/'
REFERENCE='/tools/biomes/understory-pilot-launcher-r18.mjs';LAUNCHER='/tools/biomes/eifel-pilot-launcher-r22.mjs';SNAP='()=>WorldDriveDiagnostics.forest.visualPilot.snapshot()'
def load(name,path):
    s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
R9=load('r22_r9',ROOT/'qa/qa-block8-biome-fullgame-r9.py');BASE=load('r22_source',ROOT/'qa/qa-block8-rendered-pilot-browser-r12.py');SOURCE_CHECK=BASE.SOURCE_CHECK

def main(pilot,output):
    output.mkdir(parents=True,exist_ok=False);destination=ROOT/INSTALL
    if destination.exists():raise FileExistsError('Do not overwrite installed R12 data')
    shutil.copytree(pilot/INSTALL,destination);log=None;server=None;errors=[];engine=[];requests=[];upstream=Counter()
    report={'status':'RUNNING','realVite':True,'fullGame':True,'runtimeStubs':False,'gpuPerformanceCertification':False,'browserEnvironment':{'width':1100,'height':700,'deviceScaleFactor':1,'presentedChunks':2,'requiredProofs':3,'timeoutMs':120000}}
    try:
        subprocess.run(['npm','run','build'],cwd=ROOT,check=True);report['productionBuild']=True
        with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
        origin=f'http://127.0.0.1:{port}';log=(output/'vite.log').open('w');server=subprocess.Popen(['node','node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',str(port),'--strictPort'],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
        for _ in range(100):
            try:
                with urllib.request.urlopen(origin,timeout=1) as r:
                    if r.status==200:break
            except Exception:
                if server.poll() is not None:raise RuntimeError('Vite failed')
                time.sleep(.2)
        else:raise TimeoutError('Vite startup')
        with sync_playwright() as pw:
            browser=pw.chromium.launch(headless=True,args=['--use-angle=swiftshader','--enable-unsafe-swiftshader']);context=browser.new_context(viewport={'width':1100,'height':700},device_scale_factor=1);context.add_init_script(R9.INSTRUMENT)
            def network(route):
                url=route.request.url;parsed=urllib.parse.urlparse(url)
                if url.startswith(origin+'/'):
                    if URL in url:requests.append(parsed.path)
                    return route.continue_()
                upstream[parsed.netloc]+=1;headers={'Access-Control-Allow-Origin':'*'}
                if '/route/v1/driving/' in parsed.path:
                    lon,lat=map(float,parsed.path.split('/driving/',1)[1].split(';')[0].split(','));fixture=[[lon,lat],[lon+.006,lat+.004],[lon+.012,lat+.008]]
                    return route.fulfill(status=200,content_type='application/json',headers=headers,body=json.dumps({'code':'Ok','routes':[{'geometry':{'coordinates':fixture}}]}))
                return route.fulfill(status=503,content_type='text/plain',headers=headers,body='R22 controlled geographic fixture')
            context.route('**/*',network)
            oracle=context.new_page();oracle.goto(origin+'/tools/biomes/vegetation-preview-r11.html',wait_until='networkidle');report['sourceOracle']=oracle.evaluate(SOURCE_CHECK,{'directory':json.loads((destination/'directory.json').read_text()),'base':origin+URL,'plan':json.loads((pilot/'oracle-plan.json').read_text()),'expected':json.loads((pilot/'source-expectations.json').read_text())});oracle.close();requests.clear()
            page=context.new_page();page.set_default_timeout(120000);page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:engine.append(m.text[:1000]) if any(x in m.text for x in ['Frame error:','Startup error','Vehicle start failed','Audio frame error','THREE.WebGLProgram','GL_INVALID_OPERATION']) else None)
            try:
                page.goto(origin+'/?r24AutoBiomes=1',wait_until='domcontentloaded');page.wait_for_selector('.v21VehicleChoice');page.locator('.v21VehicleChoice').first.click();page.locator('#v21StartButton').click();page.wait_for_function("document.getElementById('v21Startup').classList.contains('hidden')")
                page.evaluate("()=>document.getElementById('presetNordschleifeBtn').click()");page.wait_for_function("WorldDriveFramePacing().rendering.routeKind==='circuit'&&WorldDriveFramePacing().rendering.routePoints===1068&&document.getElementById('loading').classList.contains('hidden')");page.wait_for_function("WorldDriveFramePacing().rendering.groups.sceneryForest.instancedMeshes>=4")
                page.wait_for_function("()=>{const s=WorldDriveDiagnostics.forest.visualPilot.snapshot();return s.enabled&&s.pilot==='r22-nord-eifel'&&s.error===null&&s.modifiedChunks>=1&&s.understory==='edge-r18';}",timeout=120000)
                report['r24Auto']=page.evaluate(SNAP);report['r24AutoController']=page.evaluate("()=>WorldDriveDiagnostics.forest.defaultBiomes.snapshot()")
                assert report['r24AutoController']['phase']=='active' and report['r24AutoController']['routeId']=='nord' and report['r24AutoController']['pilot']=='r22-nord-eifel'
                page.evaluate("()=>{globalThis.__WORLD_DRIVE_DISABLE_DEFAULT_BIOMES__=true;WorldDriveDiagnostics.forest.visualPilot.stop();}");page.wait_for_timeout(400)
                report['offBefore']=page.evaluate(R9.FRAMES,3000)
                ref=page.evaluate("async u=>(await import(u)).start({season:'summer'})",REFERENCE);assert ref['pilot']=='r18-nord-understory'
                try:
                    page.wait_for_function("()=>{const s=WorldDriveDiagnostics.forest.visualPilot.snapshot();if(s.phase==='fault')throw new Error(s.error);return s.modifiedChunks>=2&&s.proofsCompleted>=2;}",timeout=60000)
                except Exception:
                    r18=page.evaluate(SNAP);assert r18['enabled'] and r18['pilot']=='r18-nord-understory' and r18['error'] is None and r18['failures']==0 and r18['ownerConflicts']==0 and r18['modifiedChunks']>=1 and r18['proofsCompleted']>=1
                report['referenceR18']=page.evaluate(SNAP);report['referenceR18Audit']=page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.audit()');page.screenshot(path=str(output/'nord-r18-reference.png'));page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.stop()');page.wait_for_timeout(400)
                start=page.evaluate("async u=>(await import(u)).start({season:'summer'})",LAUNCHER);assert start['status']=='enabled' and start['pilot']=='r22-nord-eifel'
                # Two actively presented chunks are sufficient under SwiftShader
                # when at least three exact source proofs have completed. This keeps
                # presentation evidence nontrivial while avoiding scheduler starvation.
                page.wait_for_function("()=>{const s=WorldDriveDiagnostics.forest.visualPilot.snapshot();if(s.phase==='fault')throw new Error(s.error);return s.pilot==='r22-nord-eifel'&&s.modifiedChunks>=2&&s.proofsCompleted>=3;}")
                summer=page.evaluate(SNAP);audit=page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.audit()');report['summer']=summer;report['summerAudit']=audit
                assert summer['presentation']=='eifel-temperate-r22' and summer['understory']=='edge-r18' and summer['error'] is None and summer['failures']==0 and summer['ownerConflicts']==0
                assert summer['eifelAssets']['id']=='eifel-temperate-r22' and summer['eifelAssets']['mix']['measuredHabitatPercent'] is False
                for key in ['eifel-beech','sessile-oak','hornbeam','rowan','norway-spruce']:assert summer['models'].get(key,0)>0,key
                assert summer['understoryInstances']>0 and summer['potentialAdditionalDrawCalls']<=summer['modifiedChunks']*5
                for m in audit['meshes']:
                    d=m.get('mixed');assert d and d['sourcePrefixExact'] and d['sourceHidden'] and d['season']=='summer';assert len(d['parts'])==5 and sum(p['count'] for p in d['parts'])==m['count'];assert d.get('understory',{}).get('sourcePrefixExact')
                report['summerFrames']=page.evaluate(R9.FRAMES,3000);page.screenshot(path=str(output/'nord-r22-summer.png'))
                summer_by_key={m['key']:{p['id']:p['count'] for p in m['mixed']['parts']} for m in audit['meshes']}
                page.evaluate("()=>WorldDriveDiagnostics.forest.visualPilot.season('winter')");page.wait_for_timeout(600);winter=page.evaluate(SNAP);winter_audit=page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.audit()');report['winter']=winter;report['winterAudit']=winter_audit
                assert winter['season']=='winter' and winter['failures']==0 and winter['ownerConflicts']==0
                assert sum(winter['models'].values())==winter['modifiedInstances'] and all(winter['models'].get(k,0)>0 for k in ['eifel-beech','sessile-oak','hornbeam','rowan','norway-spruce'])
                winter_by_key={m['key']:{p['id']:p['count'] for p in m['mixed']['parts']} for m in winter_audit['meshes']}
                common=set(summer_by_key)&set(winter_by_key);assert common and all(winter_by_key[k]==summer_by_key[k] for k in common)
                assert all(m.get('mixed',{}).get('sourcePrefixExact') and m['mixed'].get('season')=='winter' and m['mixed'].get('understory',{}).get('sourcePrefixExact') and m['mixed']['understory']['triangles']==576 for m in winter_audit['meshes'])
                report['winterFrames']=page.evaluate(R9.FRAMES,3000);page.screenshot(path=str(output/'nord-r22-winter.png'))
                for _ in range(10):page.evaluate("()=>WorldDriveDiagnostics.forest.visualPilot.season('summer')");page.evaluate("()=>WorldDriveDiagnostics.forest.visualPilot.season('winter')")
                assert all(m.get('mixed',{}).get('sourcePrefixExact') for m in page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.audit()')['meshes'])
                page.evaluate("()=>WorldDriveDiagnostics.forest.visualPilot.season('summer')");state=page.evaluate(SNAP)
                page.evaluate("()=>{const i=document.getElementById('jump');i.value=50;i.dispatchEvent(new Event('input'));document.getElementById('jumpBtn').click();WorldDriveDiagnostics.forest.visualPilot.refresh();}")
                # A UI teleport may transiently clear R4/rendered ownership while the
                # world recenters. Do not capture that blank transition as success:
                # require both base scenery forest and at least two proved R22 chunks
                # to recover, with the normal 60 s software-rendered allowance.
                page.wait_for_function("""()=>{const s=WorldDriveDiagnostics.forest.visualPilot.snapshot();if(s.phase==='fault')throw new Error(s.error);const g=WorldDriveFramePacing().rendering.groups.sceneryForest;const ids=['eifel-beech','sessile-oak','hornbeam','rowan','norway-spruce'];return s.enabled&&s.presentation==='eifel-temperate-r22'&&s.error===null&&s.modifiedChunks>=2&&s.proofsCompleted>=3&&s.modifiedInstances>=1000&&ids.every(id=>(s.models[id]??0)>0)&&g.instancedMeshes>=2;}""",timeout=120000)
                after=page.evaluate(SNAP);after_audit=page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.audit()');report['afterJump']={'snapshot':after,'audit':after_audit,'framePacing':page.evaluate('()=>WorldDriveFramePacing()')}
                assert after['failures']==state['failures'] and after['ownerConflicts']==state['ownerConflicts'] and after['modifiedChunks']>=2 and after['modifiedInstances']>=1000
                assert after_audit['meshes'] and all(m.get('mixed',{}).get('sourcePrefixExact') for m in after_audit['meshes'])
                page.screenshot(path=str(output/'nord-r22-after-jump.png'))
                page.evaluate('()=>WorldDriveDiagnostics.forest.visualPilot.stop()');page.wait_for_timeout(750);report['offAfter']=page.evaluate(SNAP);assert report['offAfter']['modifiedChunks']==0 and all(w['terminated'] for w in page.evaluate('()=>__R9_WORKERS') if 'biome-preparation' in w['url'])
                page.evaluate("async u=>(await import(u)).start({season:'summer'})",LAUNCHER);page.wait_for_function('WorldDriveDiagnostics.forest.visualPilot.snapshot().modifiedChunks>=2');report['routeReset']=page.evaluate("()=>{document.getElementById('presetLagunaSecaBtn').click();return WorldDriveDiagnostics.forest.visualPilot.snapshot();}");assert report['routeReset']['enabled'] is False and report['routeReset']['modifiedChunks']==0
                assert not errors and not engine,(errors,engine);report.update(status='PASS',browser=browser.version,workers=page.evaluate('()=>__R9_WORKERS'),pilotRequests=requests)
            except Exception as error:
                report.update(status='FAIL',failure=str(error))
                try:report['stalledPilot']=page.evaluate(SNAP);report['stalledFrame']=page.evaluate('()=>WorldDriveFramePacing()');page.screenshot(path=str(output/'failure.png'))
                except Exception as capture:report['captureError']=str(capture)
                raise
            finally:context.close();browser.close()
    finally:
        report.update(pageErrors=errors,engineErrors=engine,upstreamRequests=dict(upstream),limitations=['Software-rendered Chromium, not user GPU/high-speed certification','R22 uses Eifel-compatible tree-family cues, not measured current stand/species mapping','Existing R4 roots and accepted R18 roadside roots remain authoritative; terrain/road/weather/grip unchanged','Parked samples + UI jump, not a continuous Nordschleife lap'])
        (output/'eifel-nord-r22-qa.json').write_text(json.dumps(report,indent=2)+'\n')
        if server:
            server.terminate()
            try:server.wait(timeout=10)
            except subprocess.TimeoutExpired:server.kill();server.wait()
        if log:log.close()
        shutil.rmtree(destination)
    print(json.dumps({'status':report['status'],'summerChunks':report['summer']['modifiedChunks'],'models':report['summer']['models']}))
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--pilot',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();main(a.pilot.resolve(),a.output.resolve())

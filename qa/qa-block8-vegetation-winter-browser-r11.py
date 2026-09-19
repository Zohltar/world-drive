"""Winter gallery in real Vite/Chromium; UI changes, cleanup and rendered evidence."""
import argparse
import json
from pathlib import Path
import socket
import subprocess
import time
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        port = s.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    with (args.output / 'winter-vite.log').open('w') as log:
        server = subprocess.Popen(['node','node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',str(port),'--strictPort'],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
        try:
            for _ in range(120):
                if server.poll() is not None:
                    raise RuntimeError('Vite exited before readiness')
                try:
                    with urlopen(base+'/tools/biomes/vegetation-preview-r11.html',timeout=1) as r:
                        if r.status == 200: break
                except OSError: time.sleep(.25)
            else: raise RuntimeError('Vite readiness timeout')
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
                page = browser.new_page(viewport={'width':1500,'height':860},device_scale_factor=1)
                errors, requests = [], []
                page.on('pageerror',lambda error:errors.append(str(error)))
                page.on('request',lambda request:requests.append(request.url))
                page.goto(base+'/tools/biomes/vegetation-preview-r11.html',wait_until='networkidle',timeout=60000)
                page.wait_for_function('window.__VEGETATION_PREVIEW__?.ready === true',timeout=30000)
                assert page.evaluate('window.__VEGETATION_PREVIEW__.assets.length') == 6
                summer = page.evaluate('window.__VEGETATION_PREVIEW__.stats')
                page.screenshot(path=str(args.output/'summer.png'),full_page=True)
                page.select_option('#season','winter')
                assert page.locator('#labels > div').count() == 4
                assert 'dénudé et enneigé' in page.locator('#labels').inner_text()
                report = page.evaluate('''()=>{
                  const v=window.__VEGETATION_PREVIEW__;
                  if(v.assets.length!==4||v.assets.some(a=>a.season!=='winter'))throw Error('Winter view mismatch');
                  if(v.assets.find(a=>a.baseId==='preview-temperate').leafless!==true)throw Error('Leafless requirement lost');
                  v.draw();const calls=v.renderer.info.render.calls,triangles=v.renderer.info.render.triangles;
                  if(calls!==8)throw Error('Expected four single-part models plus four pedestals');
                  if(new Set(v.allAssets.map(a=>a.parts[0].material)).size!==1)throw Error('Material fanout');
                  const before=v.renderer.info.memory.geometries;
                  for(let i=0;i<100;i++){v.setSeason('summer');v.setSeason('winter');}
                  if(v.renderer.info.memory.geometries!==before)throw Error('Season switch leaked geometry');
                  return {status:'PASS',stats:v.stats,THREE:v.THREE.REVISION,drawCalls:calls,renderedTrianglesIncludingPedestals:triangles,
                    residentGeometries:before,seasonSwitches:200,allAssetCount:v.allAssets.length,scope:'Authoring preview, not driving FPS.'};
                }''')
                page.screenshot(path=str(args.output/'winter.png'),full_page=True)
                page.locator('#wire').check()
                page.screenshot(path=str(args.output/'winter-wireframe.png'),full_page=True)
                page.locator('#wire').uncheck()
                page.locator('#rotation').evaluate("element => { element.value = '70'; }")
                page.locator('#rotation').dispatch_event('input')
                page.locator('#light').click()
                page.screenshot(path=str(args.output/'winter-side-light.png'),full_page=True)
                page.select_option('#season','summer')
                assert page.evaluate('window.__VEGETATION_PREVIEW__.stats') == summer
                page.goto(base+'/tools/biomes/vegetation-preview-r11.html?season=winter',wait_until='networkidle',timeout=60000)
                assert page.evaluate('window.__VEGETATION_PREVIEW__.season') == 'winter'
                assert page.locator('#season').input_value() == 'winter'
                page.set_viewport_size({'width':900,'height':800})
                page.screenshot(path=str(args.output/'winter-narrow.png'),full_page=True)
                assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
                if errors: raise AssertionError(errors)
                external = [r for r in requests if not r.startswith(base+'/')]
                if external: raise AssertionError(external)
                report.update(browser=browser.version,pageErrors=errors,externalRequests=external,
                    summerStatsUnchanged=True,winterDeepLink=True,narrowLayout=True)
                (args.output/'winter-browser-qa.json').write_text(json.dumps(report,indent=2)+'\n')
                print(json.dumps(report,indent=2))
                browser.close()
        finally:
            server.terminate()
            try: server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill();server.wait(timeout=5)

if __name__ == '__main__': main()

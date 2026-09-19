"""Real Three.js + Chromium authoring gallery. This is NOT a driving benchmark."""
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import time
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--output', type=Path, required=True)
    args = ap.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        port = s.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    with (args.output / 'vite.log').open('w') as log:
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
                page = browser.new_page(viewport={'width':1500,'height':820},device_scale_factor=1)
                errors, requests = [], []
                page.on('pageerror',lambda error:errors.append(str(error)))
                page.on('request',lambda request:requests.append(request.url))
                page.goto(base+'/tools/biomes/vegetation-preview-r11.html',wait_until='networkidle',timeout=60000)
                page.wait_for_function('window.__VEGETATION_PREVIEW__?.ready === true',timeout=30000)
                report = page.evaluate("""async()=>{
                  const v=window.__VEGETATION_PREVIEW__,{THREE}=v;
                  const fail=m=>{throw new Error(m)};
                  const {buildForestProxyAssets}=await import('/src/forest-proxy-assets.js');
                  const refs=buildForestProxyAssets(THREE),ref=refs.find(a=>a.name==='proxy-mid');
                  const reference=v.assets[0].parts[0].geometry,original=ref.parts[0].geometry;
                  for(const name of Object.keys(original.attributes)){
                    const a=reference.attributes[name].array,b=original.attributes[name].array;
                    if(a.length!==b.length||a.some((x,i)=>x!==b[i]))fail(`Conifer ${name} changed`);
                  }
                  if(reference.index.array.some((x,i)=>x!==original.index.array[i]))fail('Conifer index changed');
                  const materials=new Set();let checkedVertices=0;
                  for(const a of v.assets){
                    if(a.parts.length!==1||a.productionApproved!==false||a.placementAuthority!==false)fail('Not isolated one-part prototype');
                    const {geometry:g,material:m}=a.parts[0];materials.add(m);
                    const triangles=(g.index?.count||g.attributes.position.count)/3;
                    if(triangles!==a.triangles||triangles>68)fail('Triangle budget drift');
                    if(m.transparent||m.alphaTest!==0||m.map||m.side!==THREE.FrontSide||!m.vertexColors)fail('Material regression');
                    const box=g.boundingBox,sphere=g.boundingSphere;
                    if(!box||!sphere||!Number.isFinite(sphere.radius)||sphere.radius<=0)fail('Invalid bounds');
                    const p=new THREE.Vector3();for(let i=0;i<g.attributes.position.count;i++){
                      p.fromBufferAttribute(g.attributes.position,i);
                      if(!box.containsPoint(p)||p.distanceTo(sphere.center)>sphere.radius+1e-5)fail('Vertex outside bounds');checkedVertices++;
                    }
                    const instance=new THREE.InstancedMesh(g,m,2);instance.setMatrixAt(0,new THREE.Matrix4());instance.setMatrixAt(1,new THREE.Matrix4().makeTranslation(3,0,0));
                    instance.instanceMatrix.needsUpdate=true;if(instance.instanceMatrix.array.some(x=>!Number.isFinite(x)))fail('Invalid instanced geometry');instance.dispose();
                  }
                  if(materials.size!==1)fail('Unbounded material fanout');
                  for(const r of refs)for(const p of r.parts){p.geometry.dispose();p.material.dispose();}
                  return {status:'PASS',stats:v.stats,checkedVertices,sharedMaterials:materials.size,coniferExactParity:true,THREE:THREE.REVISION,scope:'Authoring gallery only, no game or GPU performance claim'};
                }""")
                page.screenshot(path=str(args.output/'gallery.png'),full_page=True)
                page.locator('#wire').check()
                page.screenshot(path=str(args.output/'wireframe.png'),full_page=True)
                page.locator('#wire').uncheck()
                page.locator('#rotation').evaluate("element => { element.value = '70'; }")
                page.locator('#rotation').dispatch_event('input')
                page.locator('#light').click()
                page.screenshot(path=str(args.output/'side-light.png'),full_page=True)
                if errors: raise AssertionError(errors)
                external = [r for r in requests if not r.startswith(base+'/')]
                if external: raise AssertionError(f'External gallery request: {external}')
                report.update(browser=browser.version,externalRequests=external,pageErrors=errors)
                (args.output/'browser-qa.json').write_text(json.dumps(report,indent=2)+'\n')
                browser.close()
                print(json.dumps(report,indent=2))
        finally:
            server.terminate()
            try: server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill();server.wait(timeout=5)

if __name__ == '__main__': main()

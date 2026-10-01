#!/usr/bin/env python3
"""Real Vite dev/preview gzip contract; native Worker on the reported circuit.

The control removes ONLY the new header plugin from the actual Vite config.
This is a transport/Worker integration test, not gameplay or FPS certification.
Run after the existing full-game R9 test has produced dist and its pinned pilot.
"""
from __future__ import annotations
import argparse
from contextlib import contextmanager
import hashlib
import json
from pathlib import Path
import shutil
import socket
import subprocess
import time
import urllib.request
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
INSTALL = Path('local-data/biomes/pilot-r9')
JS = r'''async ({directory, baseUrl, coordinates, control}) => {
  const {createBiomeWorkerClient}=await import('/src/scenery/biomes/biome-worker-client.js');
  const {createBiomeChunkContextBridge}=await import('/src/scenery/biomes/chunk-context-bridge.js');
  const {createForestCandidateAdapter,FOREST_LAYOUT_ID}=await import('/src/scenery/biomes/forest-candidate-adapter.js');
  const must=(v,m)=>{if(!v)throw new Error(m);};
  globalThis.DecompressionStream=class{constructor(){throw new Error('MAIN_GZIP');}};
  crypto.subtle.digest=()=>{throw new Error('MAIN_DIGEST');};
  const fetchOriginal=globalThis.fetch;
  globalThis.fetch=(url,...args)=>{if(/(?:batch-\d+-\d+\.json|\.json\.gz)$/.test(String(url)))throw new Error('MAIN_TILE_FETCH');return fetchOriginal(url,...args);};
  const c=createBiomeWorkerClient();
  let b;
  try {
    await c.initialize({directory,baseUrl});
    b=createBiomeChunkContextBridge({client:c,identity:directory,layoutId:FOREST_LAYOUT_ID,maxChunks:4,maxBytes:160000});
    const cases=[{name:'reported-nordschleife',coordinates,origin:{lat:50.337751,lon:6.951275},cx:-2,cz:-1,position:846.2319586189196},
      ...[[6.95,50.35],[7.05,50.35],[-121.75,36.55]].map(([lon,lat],i)=>({name:'tile-'+i,
        coordinates:[[lon,lat],[lon+.00001,lat]],origin:{lat,lon},cx:0,cz:0,position:0}))];
    const rows=[];
    for(const item of cases) {
      const routeId='r9a-'+item.name,a=createForestCandidateAdapter({routeId,origin:item.origin});
      must((await b.setRoute(item.coordinates,{projectionId:a.projectionId})).status==='route-ready','route');
      const window=await b.update(item.position,{aheadMeters:0,behindMeters:0,corridorMeters:0});
      if(control){const worker=await c.diagnostics();must(window.status==='unavailable','control must reproduce rejection');
        must(worker.transport.started>0&&worker.transport.loaded===0&&worker.transport.rejected>0,'control transport');
        must(b.diagnostics().published===0,'control published a packet');return {status:'EXPECTED_REJECTION',worker};}
      must(window.status==='ready','Vite window: '+JSON.stringify(await c.diagnostics()));
      const prepared=await b.prepareForestChunk({cx:item.cx,cz:item.cz,origin:item.origin,routeId});
      must(prepared.status==='prepared','snapshot');
      const scratch={};let resolved=0;
      for(let i=0;i<1744;i++){const p=a.point(item.cx,item.cz,i,scratch),q=prepared.snapshot.lookup(i,p.lon,p.lat);
        must(q.status==='resolved'&&q.placementAuthority===false,'exact candidate not resolved');resolved++;}
      rows.push({name:item.name,candidates:resolved});
    }
    const worker=await c.diagnostics(),bridge=b.diagnostics();
    must(worker.transport.loaded>=3&&worker.transport.rejected===0,'gzip transport');
    must(bridge.published===4&&bridge.peakBytes<=160000,'snapshot bound');
    return {status:'PASS',rows,worker,bridge};
  } finally {if(b)b.dispose();else c.dispose();must(c.admission().closed,'Worker termination');}
}'''

@contextmanager
def vite(mode: str, output: Path, config: Path | None = None):
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]
    command = ['node', str(ROOT/'node_modules/vite/bin/vite.js')]
    if mode == 'preview':
        command += ['preview']
    command += ['--host', '127.0.0.1', '--port', str(port), '--strictPort']
    if config:
        command += ['--config', str(config)]
    with (output/f'{mode}-server.log').open('w') as log:
        process = subprocess.Popen(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
        origin = f'http://127.0.0.1:{port}'
        try:
            for _ in range(150):
                if process.poll() is not None:
                    raise RuntimeError('Vite terminated; see log')
                try:
                    with urllib.request.urlopen(origin+'/'+INSTALL.as_posix()+'/directory.json', timeout=1) as r:
                        if r.status == 200:
                            break
                except OSError:
                    pass
                time.sleep(.2)
            else:
                raise TimeoutError('Vite startup')
            yield origin
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill(); process.wait(timeout=10)

def main(pilot: Path, output: Path):
    output.mkdir(parents=True, exist_ok=False)
    target = ROOT/'public'/INSTALL
    if target.exists():
        raise FileExistsError('Refusing to overwrite an installed pilot')
    manifest = json.loads((pilot/'pilot-manifest.json').read_text())
    for name, expected in manifest['files'].items():
        raw = (pilot/name).read_bytes()
        assert len(raw) == expected['bytes'] and hashlib.sha256(raw).hexdigest() == expected['sha256']
    config = output/'control.vite.config.mjs'
    config.write_text('import config from '+json.dumps((ROOT/'vite.config.js').as_uri())+';\n'
        "if(config.plugins.filter(p=>p.name==='world-drive-biome-raw-gzip').length!==1)throw Error('Missing header plugin');\n"
        "export default {...config,plugins:config.plugins.filter(p=>p.name!=='world-drive-biome-raw-gzip')};\n")
    report = {'status':'RUNNING','nativeWorker':True,'fullGame':False,'performanceCertification':False,'headers':{}}
    errors = []
    try:
        shutil.copytree(pilot, target)
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            try:
                for mode in ['control','dev','preview']:
                    with vite(mode,output,config if mode=='control' else None) as origin:
                        headers=[]
                        for name in ['1869-396.json.gz','1870-396.json.gz','582-534.json.gz']:
                            request = urllib.request.Request(origin+'/'+INSTALL.as_posix()+'/'+name,headers={'Accept-Encoding':'gzip, deflate, br'})
                            with urllib.request.urlopen(request,timeout=10) as r:
                                raw=r.read(); encoding=r.headers.get('Content-Encoding')
                                assert encoding == ('gzip' if mode=='control' else 'identity'), (mode,encoding)
                                assert raw == (pilot/name).read_bytes(), 'gzip source bytes changed'
                                assert int(r.headers['Content-Length']) == len(raw)
                                if mode!='control':
                                    assert r.headers.get('Content-Type') == 'application/octet-stream'
                                headers.append({'file':name,'encoding':encoding,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
                        report['headers'][mode]=headers
                        if mode=='preview':
                            continue
                        page=browser.new_page()
                        page.on('pageerror',lambda e:errors.append(str(e)))
                        page.route('**/__r9_transport_probe',lambda r:r.fulfill(status=200,content_type='text/html',body='<!doctype html><title>R9 transport test</title>'))
                        page.goto(origin+'/__r9_transport_probe')
                        report[mode]=page.evaluate(JS,{'directory':json.loads((pilot/'directory.json').read_text()),
                            'baseUrl':origin+'/'+INSTALL.as_posix()+'/',
                            'coordinates':json.loads((ROOT/'src/routing/circuits/nordschleife.json').read_text())['coordinates'],
                            'control':mode=='control'})
                        page.close()
                assert not errors, errors
                report['status']='PASS';report['browserVersion']=browser.version
                report['viteVersion']=subprocess.check_output(['node','-p',"require('vite/package.json').version"],cwd=ROOT,text=True).strip()
            finally:
                browser.close()
    except Exception as exc:
        report['status']='FAIL';report['error']=str(exc)
        raise
    finally:
        report['pageErrors']=errors
        (output/'vite-gzip-r9-qa.json').write_text(json.dumps(report,indent=2)+'\n')
        if target.exists():
            shutil.rmtree(target)
    print('PASS R9 Vite control rejection / dev native Worker / preview raw gzip; no hardware certification')

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pilot',required=True,type=Path)
    parser.add_argument('--output',required=True,type=Path)
    args=parser.parse_args();main(args.pilot,args.output)

#!/usr/bin/env python3
"""Full production game OFF/ON/OFF diagnostic experiment, not a GPU benchmark.

All application/render/physics services are real. Only upstream network responses
are controlled: a SHORT SYNTHETIC route boots the chooser; geographic upstreams
return 503 so the unchanged fallback paths run. Measurements then use the actual
repository circuit presets through their existing DOM controls. No game JS edits.
"""
from __future__ import annotations
import argparse
from collections import Counter
import functools
import http.server
import importlib.util
import json
import math
from pathlib import Path
import shutil
import subprocess
import threading
import urllib.parse
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('pilot_pack', ROOT / 'tools/biomes/package-diagnostic-pilot.py')
PACK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PACK)
PILOT_URL = '/local-data/biomes/pilot-r9/'
SNAPSHOT = '() => WorldDriveDiagnostics.forest.biomes.snapshot()'
FRAMES = r'''async options => {
  const duration=typeof options==='number'?options:options.duration;
  const before=WorldDriveFramePacing(), values=[];let previous=null,started=null,activation=null;
  const measured=new Promise(resolve=>{
    let done=false,id=null;
    const finish=()=>{if(done)return;done=true;clearTimeout(end);if(id!==null)cancelAnimationFrame(id);resolve();};
    const end=setTimeout(finish,duration+5000);
    function frame(t){
      if(done)return;
      if(started===null)started=t;
      if(previous!==null)values.push(t-previous);
      previous=t;
      if(t-started>=duration)finish();else id=requestAnimationFrame(frame);
    }
    id=requestAnimationFrame(frame);
  });
  if(options.startPilot)activation=await (await import(options.startPilot)).start();
  await measured;
  const after=WorldDriveFramePacing(),sorted=values.toSorted((a,b)=>a-b);
  const percentile=p=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))]:null;
  return {before,after,activation,frames:values.length,p50Ms:percentile(.5),p95Ms:percentile(.95),maxMs:sorted.at(-1)??null,
    over50ms:values.filter(t=>t>50).length,hitchDelta:(after.hitchCount??0)-(before.hitchCount??0),
    biomes:WorldDriveDiagnostics.forest.biomes.snapshot()};
}'''
INSTRUMENT = r'''(() => {
  const NativeWorker=globalThis.Worker,events=[];
  globalThis.Worker=class extends NativeWorker {
    constructor(...args){super(...args);const row={url:String(args[0]),terminated:false};events.push(row);
      const terminate=this.terminate.bind(this);this.terminate=()=>{row.terminated=true;return terminate();};}
  };
  Object.defineProperty(globalThis,'__R9_WORKERS',{value:events});
})();'''

def main(pilot: Path, output: Path):
    output.mkdir(parents=True, exist_ok=False)
    package = PACK.build(pilot, output / 'package')
    # Use the actual project's build command and entrypoint, not an isolated harness.
    subprocess.run(['npm', 'run', 'build'], cwd=ROOT, check=True)
    dist = ROOT / 'dist'
    shutil.copytree(output / 'package' / PACK.INSTALL, dist / PILOT_URL.strip('/'))
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(dist)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    origin = f'http://127.0.0.1:{server.server_port}'
    report = {'status': 'RUNNING', 'fullGame': True, 'productionBuild': True, 'runtimeStubs': False,
        'bootstrap': 'SHORT SYNTHETIC network response, excluded from geographic validation',
        'upstreamGeography': '503 fixtures; unchanged application fallback paths',
        'performanceCertification': False, 'package': package, 'routes': []}
    errors, console, pilot_requests, engine_errors = [], [], [], []
    upstream = Counter()
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width': 960, 'height': 540}, device_scale_factor=1)
        context.add_init_script(INSTRUMENT)
        def network(route):
            url = route.request.url
            parsed = urllib.parse.urlparse(url)
            if url.startswith(origin + '/'):
                if PILOT_URL in url:
                    pilot_requests.append({'url': parsed.path, 'type': route.request.resource_type})
                return route.continue_()
            upstream[parsed.netloc] += 1
            headers = {'Access-Control-Allow-Origin': '*'}
            if '/route/v1/driving/' in parsed.path:
                first = parsed.path.split('/driving/', 1)[1].split(';')[0]
                lon, lat = map(float, first.split(','))
                fixture = [[lon, lat], [lon + .006, lat + .004], [lon + .012, lat + .008]]
                return route.fulfill(status=200, content_type='application/json', headers=headers,
                    body=json.dumps({'code': 'Ok', 'routes': [{'geometry': {'coordinates': fixture}}]}))
            return route.fulfill(status=503, content_type='text/plain', headers=headers, body='R9 offline upstream fixture')
        context.route('**/*', network)
        page = context.new_page()
        page.set_default_timeout(90000)
        page.on('pageerror', lambda e: errors.append(str(e)))
        def record_console(message):
            text = message.text
            if any(marker in text for marker in ('Frame error:', 'Startup error', 'Vehicle start failed', 'Audio frame error')):
                if len(engine_errors) < 50:
                    engine_errors.append(text[:1000])
            if message.type in ('error', 'warning') and len(console) < 100:
                console.append({'type': message.type, 'text': text[:600]})
        page.on('console', record_console)
        try:
            page.goto(origin + '/', wait_until='domcontentloaded')
            page.wait_for_selector('.v21VehicleChoice')
            page.locator('.v21VehicleChoice').first.click()
            page.locator('#v21StartButton').click()
            page.wait_for_function("document.getElementById('v21Startup').classList.contains('hidden')")
            assert page.evaluate("() => document.querySelectorAll('#app canvas').length") > 0
            assert page.evaluate(SNAPSHOT)['enabled'] is False
            assert not pilot_requests, 'Default game fetched diagnostic pilot'
            assert not page.evaluate('() => __R9_WORKERS.filter(w=>w.url.includes("biome-preparation")).length')
            report['defaultOffNoPilotRequests'] = True
            report['browser'] = browser.version
            report['webgl'] = page.evaluate('''() => {
              const canvas=document.querySelector('#app canvas');const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
              if(!gl)return null;const ext=gl.getExtension('WEBGL_debug_renderer_info');
              return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),version:gl.getParameter(gl.VERSION)};
            }''')
            assert report['webgl'], 'No actual WebGL renderer'
            for key, button in [('laguna-seca', 'presetLagunaSecaBtn'), ('nordschleife', 'presetNordschleifeBtn')]:
                coordinates = json.loads((ROOT / f'src/routing/circuits/{key}.json').read_text())
                if isinstance(coordinates, dict):
                    coordinates = coordinates['coordinates']
                # Independent spherical total: a fresh chunk alone cannot prove
                # that the observer selected the right part of a winding track.
                def segment_length(a, b):
                    dy, dx = math.radians(b[1] - a[1]), math.radians(b[0] - a[0])
                    h = math.sin(dy / 2) ** 2 + math.cos(math.radians(a[1])) * math.cos(math.radians(b[1])) * math.sin(dx / 2) ** 2
                    return 2 * 6371008.8 * math.asin(math.sqrt(max(0, min(1, h))))
                total_meters = sum(segment_length(a, b) for a, b in zip(coordinates, coordinates[1:]))
                # Real UI handlers choose the unmodified authored preset.
                page.evaluate('(id)=>document.getElementById(id).click()', button)
                page.wait_for_function('''n => WorldDriveFramePacing().rendering.routeKind==='circuit'
                  && WorldDriveFramePacing().rendering.routePoints===n
                  && document.getElementById('loading').classList.contains('hidden')''', arg=len(coordinates))
                page.wait_for_timeout(6000)
                off1 = page.evaluate(FRAMES, 6000)
                assert off1['frames'] >= 3 and off1['after']['rendering']['drawCalls'] > 0
                assert off1['after']['rendering']['triangles'] > 0
                activation = page.evaluate(FRAMES, {'duration': 6000, 'startPilot': PILOT_URL + 'start.mjs'})
                assert activation['activation']['status'] == 'enabled' and activation['frames'] >= 3
                page.wait_for_function("() => { const d=WorldDriveDiagnostics.forest.biomes.snapshot(); return d.phase==='observed' && d.freshCurrentChunk; }")
                on = page.evaluate(FRAMES, 6000)
                assert on['frames'] >= 3
                d = on['biomes']
                current = next(c for c in d['last']['chunks'] if c['role'] == 'current')
                assert current['counts']['resolved'] == 1744 and current['counts']['unavailable'] == 0
                assert d['placementAuthority'] is False and d['maxChunksRequested'] <= 4
                assert d['bridge']['peakChunks'] <= 16 and d['bridge']['peakBytes'] <= 4 * 1024 * 1024
                # Paired parked windows precede teleports, which would change the workload.
                page.evaluate('() => WorldDriveDiagnostics.forest.biomes.stop()')
                page.wait_for_timeout(750)
                requests_before = len(pilot_requests)
                off2 = page.evaluate(FRAMES, 6000)
                assert len(pilot_requests) == requests_before, 'Stopped pilot started new network work'
                assert off2['biomes']['enabled'] is False
                page.evaluate("async u => (await import(u)).start()", PILOT_URL + 'start.mjs')
                page.wait_for_function("() => {const d=WorldDriveDiagnostics.forest.biomes.snapshot();return d.phase==='observed'&&d.freshCurrentChunk;}")
                jumps = []
                for fraction in (25, 75):
                    before = page.evaluate(SNAPSHOT)['last']['at']
                    page.evaluate('''p=>{const input=document.getElementById('jump');input.value=p;
                      input.dispatchEvent(new Event('input'));document.getElementById('jumpBtn').click();
                      WorldDriveDiagnostics.forest.biomes.refresh();}''', fraction)
                    page.wait_for_function('''t=>{const d=WorldDriveDiagnostics.forest.biomes.snapshot();
                      return d.phase==='observed'&&d.freshCurrentChunk&&d.last.at>t;}''', arg=before)
                    observed = page.evaluate(SNAPSHOT)
                    expected_progress = total_meters * fraction / 100
                    assert abs(observed['last']['progress'] - expected_progress) < 25, 'Observer followed a stale route segment after UI jump'
                    assert observed['last']['distanceFromRoute'] < 20, 'Observer failed to re-anchor to the actual track'
                    observed['testTargetPercent'] = fraction
                    observed['testExpectedProgress'] = expected_progress
                    jumps.append(observed)
                page.screenshot(path=str(output / (key + '-on.png')))
                page.evaluate('() => WorldDriveDiagnostics.forest.biomes.stop()')
                workers = page.evaluate('() => __R9_WORKERS')
                assert all(w['terminated'] for w in workers if 'biome-preparation' in w['url']), workers
                report['routes'].append({'route': key, 'vertices': len(coordinates), 'offBefore': off1,
                    'activation': activation, 'on': on, 'jumps': jumps, 'offAfter': off2, 'workers': workers})
            assert not errors, errors
            assert not engine_errors, engine_errors
            report['status'] = 'PASS'
        except Exception as error:
            report['status'] = 'FAIL'
            report['failure'] = str(error)
            try:
                report['lastDiagnostics'] = page.evaluate(SNAPSHOT)
                report['lastFramePacing'] = page.evaluate('() => WorldDriveFramePacing()')
                report['bodyText'] = page.locator('body').inner_text()[:5000]
                page.screenshot(path=str(output / 'failure.png'))
            except Exception as capture_error:
                report['captureError'] = str(capture_error)
            raise
        finally:
            report.update(pageErrors=errors, caughtEngineErrors=engine_errors, console=console, upstreamRequests=dict(upstream), pilotRequests=pilot_requests,
                limitations=['Headless software-rendered CI, NOT GPU/FPS certification',
                    'OFF/ON/OFF parked samples plus UI teleports; NOT continuous high-speed driving',
                    'Upstream DEM/imagery/OSM use failure fixtures; not real visual terrain validation',
                    'Three finite pilot source tiles; NOT a real long-road or global coverage claim'])
            (output / 'fullgame-r9-qa.json').write_text(json.dumps(report, indent=2) + '\n')
            context.close()
            browser.close()
            server.shutdown()
            server.server_close()
            thread.join()
    print(json.dumps({'status': report['status'], 'routes': len(report['routes']), 'renderer': report['webgl'],
        'pilotZipBytes': package['zipBytes']}, indent=2))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pilot', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    a = parser.parse_args()
    main(a.pilot.resolve(), a.output.resolve())

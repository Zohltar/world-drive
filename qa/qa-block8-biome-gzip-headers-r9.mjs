import assert from 'node:assert/strict';
import {worldDriveBiomeRawGzip} from '../tools/biomes/vite-raw-gzip.mjs';
const plugin=worldDriveBiomeRawGzip();
assert.equal(plugin.name,'world-drive-biome-raw-gzip');
assert.equal(plugin.buildStart,undefined);
assert.equal(plugin.closeBundle,undefined);
let checked=0;
for(const hook of ['configureServer','configurePreviewServer']) {
  let middleware;
  plugin[hook]({middlewares:{use(fn){assert.equal(middleware,undefined);middleware=fn;}}});
  function request(url,method='GET') {
    let next=0;
    const headers=new Map(),req={url,method},before={...req};
    middleware(req,{setHeader(k,v){headers.set(k.toLowerCase(),v);}},()=>next++);
    assert.equal(next,1);assert.deepEqual(req,before);checked++;
    return Object.fromEntries(headers);
  }
  for(const method of ['GET','HEAD'])for(const url of [
    '/local-data/biomes/pilot-r9/1869-396.json.gz',
    '/local-data/biomes/1870-396.json.gz?download=1',
    '/local-data/biomes/future_region/page-1/582-534.json.gz'
  ])assert.deepEqual(request(url,method),{
    'content-encoding':'identity','content-type':'application/octet-stream'
  });
  for(const url of [
    '/world-data/osm-v2/quebec/hydro/1869-396.json.gz',
    '/local-data/biomes/pilot-r9/batch-186-39.json',
    '/local-data/biomes/pilot-r9/start.mjs','/assets/audio/test.mp3',
    '/local-data/biomes-other/1869-396.json.gz','/local-data/biomes/../1869-396.json.gz',
    '/local-data/biomes/%2e%2e/1869-396.json.gz','//local-data/biomes/1869-396.json.gz',
    '/local-data/biomes/1869-396.json.gz/','/local-data/biomes/1869-396.json.gz.js',
    'http://elsewhere/local-data/biomes/1869-396.json.gz',
    '/local-data/biomes/'+('a/'.repeat(300))+'1869-396.json.gz',undefined
  ])assert.deepEqual(request(url),{});
  for(const method of ['POST','OPTIONS','PUT'])assert.deepEqual(request('/local-data/biomes/1869-396.json.gz',method),{});
}
console.log(`PASS R9 biome raw-gzip headers: ${checked} scoped dev/preview requests; no file IO or build hooks`);

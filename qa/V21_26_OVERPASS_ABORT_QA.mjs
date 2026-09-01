import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const modulePath=path.join(root,'src','overpass.js');
const desktopTransportPath=path.join(root,'src','desktop-overpass-transport.js');
const overpassSource=fs.readFileSync(modulePath,'utf8').replace(/\r\n/g,'\n');
const desktopTransportSource=fs.readFileSync(desktopTransportPath,'utf8').replace(/\r\n/g,'\n');

// V21.31 stress hardening changed the public mirror set. Keep this historical
// abort/failover QA aligned with the current production endpoints rather than
// pinning the superseded Private.coffee fallback from V21.26.
assert.match(
  overpassSource,
  /https:\/\/overpass-api\.de\/api\/interpreter/,
  'primary Overpass API endpoint missing'
);
assert.match(
  overpassSource,
  /https:\/\/overpass\.kumi\.systems\/api\/interpreter/,
  'current Kumi Overpass fallback endpoint missing'
);
assert.match(
  overpassSource,
  /https:\/\/overpass\.nchc\.org\.tw\/api\/interpreter/,
  'current NCHC Overpass fallback endpoint missing'
);
assert.doesNotMatch(
  overpassSource,
  /https:\/\/overpass\.private\.coffee\/api\/interpreter/,
  'superseded Private.coffee endpoint returned to the browser fallback set'
);
for(const host of ['overpass-api.de','overpass.kumi.systems','overpass.nchc.org.tw']){
  assert.match(
    desktopTransportSource,
    new RegExp(`'${host.replaceAll('.','\\.')}'`),
    `desktop Overpass proxy does not recognize current host ${host}`
  );
}

const { createOverpassClient }=await import(`${pathToFileURL(modulePath).href}?qa=${Date.now()}`);

function createCache(){
  return {
    pending:new Map(),
    async get(){return null;},
    async set(){}
  };
}

const originalFetch=globalThis.fetch;
const originalWarn=console.warn;

try{
  // Expected AbortError: stay silent and continue to the next endpoint.
  const abortCalls=[];
  const abortWarnings=[];
  globalThis.fetch=async endpoint=>{
    abortCalls.push(endpoint);
    throw new DOMException('signal is aborted without reason','AbortError');
  };
  console.warn=(...args)=>abortWarnings.push(args);

  const abortClient=createOverpassClient({
    cache:createCache(),
    keyFor:(namespace,lat,lon)=>`${namespace}:${lat}:${lon}`,
    endpoints:['https://qa-overpass-1.invalid','https://qa-overpass-2.invalid']
  });

  const aborted=await abortClient.fetchRaw({
    query:'[out:json];node(0,0,1,1);out;',
    label:'OSM scenery',
    timeoutMs:25
  });

  assert.equal(aborted,null,'all-aborted Overpass request should return null');
  assert.deepEqual(
    abortCalls,
    ['https://qa-overpass-1.invalid','https://qa-overpass-2.invalid'],
    'AbortError should still fall through to the next Overpass endpoint'
  );
  assert.equal(abortWarnings.length,0,'expected AbortError polluted console.warn');

  // Genuine network/runtime failure: keep warning visible and recover via the
  // next mirror. V21.31 serialization intentionally made the warning generic;
  // label is retained only for API compatibility.
  const networkCalls=[];
  const networkWarnings=[];
  globalThis.fetch=async endpoint=>{
    networkCalls.push(endpoint);
    if(networkCalls.length===1)throw new TypeError('QA network failure');
    return {
      ok:true,
      async json(){return {elements:[{id:1}]};}
    };
  };
  console.warn=(...args)=>networkWarnings.push(args);

  const networkClient=createOverpassClient({
    cache:createCache(),
    keyFor:(namespace,lat,lon)=>`${namespace}:${lat}:${lon}`,
    endpoints:['https://qa-overpass-1.invalid','https://qa-overpass-2.invalid']
  });

  const recovered=await networkClient.fetchRaw({
    query:'[out:json];node(0,0,1,1);out;',
    label:'OSM scenery',
    timeoutMs:25
  });

  assert.deepEqual(recovered,{elements:[{id:1}]},'fallback endpoint recovery changed');
  assert.deepEqual(
    networkCalls,
    ['https://qa-overpass-1.invalid','https://qa-overpass-2.invalid'],
    'genuine network failure no longer falls through to the next Overpass endpoint'
  );
  assert.equal(networkWarnings.length,1,'genuine Overpass network failure should remain visible');
  assert.equal(networkWarnings[0][0],'Overpass request failed','current generic Overpass warning changed');

  console.log('V21.26 OVERPASS ABORT QA: PASS');
  console.log('Current mirror set / desktop proxy hosts / AbortError silence / genuine failure warning verified');
}finally{
  globalThis.fetch=originalFetch;
  console.warn=originalWarn;
}

import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const modulePath=path.join(root,'src','overpass.js');
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

  // Genuine network/runtime failure: keep warning visible.
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
  assert.equal(networkWarnings.length,1,'genuine Overpass network failure should remain visible');
  assert.match(String(networkWarnings[0][0]),/OSM scenery Overpass failed/,'warning label changed');

  console.log('V21.26 OVERPASS ABORT QA: PASS');
  console.log('AbortError is silent with endpoint fallback; genuine network failures still warn');
}finally{
  globalThis.fetch=originalFetch;
  console.warn=originalWarn;
}

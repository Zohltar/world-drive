import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {Readable} from 'node:stream';
import {fileURLToPath,pathToFileURL} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const vitePath=path.join(ROOT,'vite.config.js');
const desktopTransportPath=path.join(ROOT,'src','services','desktop-overpass-transport.js');
const overpassPath=path.join(ROOT,'src','services','overpass.js');
const electronPath=path.join(ROOT,'electron','main.cjs');

const viteSource=readFileSync(vitePath,'utf8').replace(/\r\n/g,'\n');
const desktopSource=readFileSync(desktopTransportPath,'utf8').replace(/\r\n/g,'\n');
const overpassSource=readFileSync(overpassPath,'utf8').replace(/\r\n/g,'\n');
const electronSource=readFileSync(electronPath,'utf8').replace(/\r\n/g,'\n');

const EXPECTED_HOSTS=[
  'overpass-api.de',
  'overpass.kumi.systems',
  'overpass.nchc.org.tw'
];

function sorted(values){return [...values].sort();}
function extractSetHosts(source,name){
  const match=source.match(new RegExp(`const\\s+${name}=new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  assert.ok(match,`${name} set missing`);
  return [...match[1].matchAll(/'([^']+)'/g)].map(item=>item[1]);
}
function extractDefaultEndpointHosts(source){
  const match=source.match(/endpoints=\[([\s\S]*?)\],\s*minRequestGapMs=/);
  assert.ok(match,'Overpass default endpoint list missing');
  return [...match[1].matchAll(/'https:\/\/([^/]+)\/api\/interpreter'/g)].map(item=>item[1]);
}

assert.deepEqual(
  sorted(extractSetHosts(viteSource,'OVERPASS_HOSTS')),
  sorted(EXPECTED_HOSTS),
  'Vite proxy host allowlist drifted from certified production mirrors'
);
assert.deepEqual(
  sorted(extractSetHosts(desktopSource,'OVERPASS_HOSTS')),
  sorted(EXPECTED_HOSTS),
  'desktop transport host allowlist drifted from certified production mirrors'
);
assert.deepEqual(
  sorted(extractSetHosts(electronSource,'OVERPASS_PROXY_HOSTS')),
  sorted(EXPECTED_HOSTS),
  'Electron proxy host allowlist drifted from certified production mirrors'
);
assert.deepEqual(
  sorted(extractDefaultEndpointHosts(overpassSource)),
  sorted(EXPECTED_HOSTS),
  'Overpass client defaults drifted from proxy allowlists'
);

for(const source of [viteSource,desktopSource,overpassSource,electronSource]){
  assert.doesNotMatch(
    source,
    /overpass\.private\.coffee/,
    'superseded Private.coffee mirror returned to an active Overpass policy owner'
  );
}

assert.match(
  viteSource,
  /const OVERPASS_MAX_BODY_BYTES=1024\*1024;/,
  'Vite Overpass proxy lost the 1 MiB request-body ceiling'
);
assert.match(
  electronSource,
  /readRequestBody\(req,maxBytes=1024\*1024\)/,
  'Electron Overpass proxy lost the matching 1 MiB request-body ceiling'
);
assert.match(
  viteSource,
  /const OVERPASS_METHODS=new Set\(\['GET','POST'\]\);/,
  'Vite Overpass proxy method allowlist changed'
);
assert.match(
  electronSource,
  /if\(method!=='GET'&&method!=='POST'\)/,
  'Electron Overpass proxy method allowlist changed'
);

// Deliberate environment difference: Vite dev uses an HTTP-200 soft failure
// envelope to avoid expected red browser network errors during mirror failover,
// while Electron preserves real upstream/proxy HTTP status codes. Lock both
// contracts rather than forcing cosmetic parity that would alter diagnostics.
assert.match(viteSource,/res\.statusCode=200;/,'Vite soft-failure HTTP-200 contract changed');
assert.match(viteSource,/__worldDriveOverpassFailure:true/,'Vite soft-failure marker missing');
assert.match(electronSource,/res\.writeHead\(upstream\.status,/,'Electron upstream status passthrough changed');
assert.match(electronSource,/res\.writeHead\(aborted\?504:502,/,'Electron proxy failure status contract changed');

const configModule=await import(`${pathToFileURL(vitePath).href}?qa=${Date.now()}`);
const proxyPlugin=configModule.default.plugins.find(plugin=>plugin?.name==='world-drive-overpass-dev-proxy');
assert.ok(proxyPlugin,'Vite Overpass proxy plugin missing');
let middleware=null;
proxyPlugin.configureServer({
  middlewares:{
    use(route,handler){
      assert.equal(route,'/__worlddrive_proxy/overpass','Vite Overpass proxy route changed');
      middleware=handler;
    }
  }
});
assert.equal(typeof middleware,'function','Vite Overpass middleware was not registered');

function createRequest({method='POST',target=EXPECTED_HOSTS[0],chunks=[]}={}){
  const url=`/?target=${encodeURIComponent(`https://${target}/api/interpreter`)}`;
  const req=Readable.from(chunks.map(chunk=>Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk)));
  req.method=method;
  req.url=url;
  req.headers={'content-type':'application/x-www-form-urlencoded;charset=UTF-8'};
  return req;
}
function createResponse(){
  let resolve;
  const done=new Promise(r=>{resolve=r;});
  return {
    statusCode:0,
    headers:{},
    body:Buffer.alloc(0),
    setHeader(name,value){this.headers[String(name).toLowerCase()]=String(value);},
    end(payload=''){
      this.body=Buffer.isBuffer(payload)?payload:Buffer.from(String(payload));
      resolve(this);
    },
    done
  };
}
async function invoke(options){
  const req=createRequest(options);
  const res=createResponse();
  await middleware(req,res);
  return res.done;
}

const nativeFetch=globalThis.fetch;
try{
  const upstreamCalls=[];
  globalThis.fetch=async(target,init)=>{
    upstreamCalls.push({target:String(target),init});
    return {
      ok:true,
      status:200,
      headers:{get:()=> 'application/json'},
      async arrayBuffer(){return Buffer.from('{"elements":[]}');}
    };
  };

  const smallBody='data=%5Bout%3Ajson%5D%3Bnode%3Bout%3B';
  const ok=await invoke({method:'POST',chunks:[smallBody]});
  assert.equal(ok.statusCode,200,'valid Vite proxy request did not complete successfully');
  assert.equal(upstreamCalls.length,1,'valid Vite proxy request did not reach upstream');
  assert.equal(upstreamCalls[0].init.method,'POST','Vite proxy changed POST method');
  assert.equal(Buffer.from(upstreamCalls[0].init.body).toString(),smallBody,'Vite proxy changed request body');

  upstreamCalls.length=0;
  const badMethod=await invoke({method:'PUT',chunks:['x']});
  const badMethodPayload=JSON.parse(badMethod.body.toString());
  assert.equal(badMethod.statusCode,200,'Vite method rejection stopped using soft envelope');
  assert.equal(badMethodPayload.__worldDriveOverpassFailure,true,'Vite method rejection marker missing');
  assert.equal(badMethodPayload.status,405,'Vite method rejection status mismatch');
  assert.equal(upstreamCalls.length,0,'disallowed Vite method reached upstream');

  const oversized=await invoke({
    method:'POST',
    chunks:[Buffer.alloc(1024*1024+1,0x61)]
  });
  const oversizedPayload=JSON.parse(oversized.body.toString());
  assert.equal(oversized.statusCode,200,'Vite oversized-body rejection stopped using soft envelope');
  assert.equal(oversizedPayload.__worldDriveOverpassFailure,true,'Vite oversized-body marker missing');
  assert.equal(oversizedPayload.status,413,'Vite oversized-body status mismatch');
  assert.equal(upstreamCalls.length,0,'oversized Vite request reached upstream');

  const staleMirror=await invoke({
    method:'POST',
    target:'overpass.private.coffee',
    chunks:[smallBody]
  });
  const stalePayload=JSON.parse(staleMirror.body.toString());
  assert.equal(stalePayload.__worldDriveOverpassFailure,true,'stale mirror rejection marker missing');
  assert.equal(upstreamCalls.length,0,'superseded Private.coffee mirror reached upstream');
}finally{
  globalThis.fetch=nativeFetch;
}

console.log('POST-REFACTOR OVERPASS PARITY R1 QA: PASS');
console.log('mirror parity / 1 MiB body cap / GET+POST policy / deliberate failure-contract divergence: verified');

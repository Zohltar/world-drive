/** Versioned, bounded manifest pages. No geometry or game-frame ownership.
 * Directory is a trusted application input; hashes detect corruption, not signatures.
 * A page covers one degree (10x10 existing tiles); unknown pages remain missing.
 */
import {prepareBiomeService} from './biome-service.js';
import {REFINEMENT_SCHEMA, MAX_TILE_JSON_BYTES} from './local-refinement.js';
export const BATCH_DIRECTORY_SCHEMA='world-drive-biome-directory-v1';
export const BATCH_PAGE_SCHEMA='world-drive-biome-page-v1';
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const int=(v,a,b)=>Number.isInteger(v)&&v>=a&&v<=b;
const freeze=Object.freeze;
const outcome=(status,reason=null,extra={})=>freeze({status,reason,...extra});
async function sha(bytes) {return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export async function createBiomeBatchSource({directory,baseUrl,fetchImpl=globalThis.fetch,
  maxCachedPages=2,timeoutMs=10000}={}) {
  const base=new URL(baseUrl);
  if(!(base.protocol==='https:'||(base.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(base.hostname)))
    ||base.username||base.password||base.search||base.hash||!base.pathname.endsWith('/'))throw new TypeError('Explicit HTTPS or loopback directory required');
  if(!int(maxCachedPages,0,8)||!int(timeoutMs,1,60000)||typeof fetchImpl!=='function'
    ||directory?.schema!==BATCH_DIRECTORY_SCHEMA||typeof directory.revision!=='string'
    ||!/^[-a-zA-Z0-9_.]{1,80}$/.test(directory.revision)||!Array.isArray(directory.batches)
    ||directory.batches.length>4096||!Array.isArray(directory.records)||directory.records.length>4096)throw new TypeError('Invalid bounded batch directory');
  const revision=directory.revision;
  const manifest={schema:REFINEMENT_SCHEMA,
    source:{id:directory.source?.id,license:directory.source?.license,sha256:directory.source?.sha256},
    records:directory.records.map(r=>r&&({id:r.id,biome:r.biome,name:r.name,realm:r.realm})),
    catalogSha256:directory.catalogSha256,tiles:[]};
  const pages=new Map(),cache=new Map();
  for(const v of directory.batches) {
    if(!v||!int(v.x,0,359)||!int(v.y,0,179)||v.file!==`batch-${v.x}-${v.y}.json`
      ||!hash(v.sha256)||!int(v.jsonBytes,1,65536))throw new TypeError('Invalid batch descriptor');
    const key=`${v.x}-${v.y}`;if(pages.has(key))throw new TypeError('Duplicate batch');
    pages.set(key,freeze({x:v.x,y:v.y,file:v.file,sha256:v.sha256,jsonBytes:v.jsonBytes}));
  }
  const validated=await prepareBiomeService({refinementManifest:manifest});validated.dispose();
  let disposed=false,active=null,cacheBytes=0;
  const stats={requests:0,hits:0,evictions:0,verified:0,rejected:0,busy:0,peakCachedPages:0,peakCachedBytes:0};
  async function page(key,signal) {
    if(cache.has(key)) {const p=cache.get(key);cache.delete(key);cache.set(key,p);stats.hits++;return p;}
    const d=pages.get(key);if(!d)return null;
    const url=new URL(d.file,base).href;
    const response=await fetchImpl(url,{signal,redirect:'error',credentials:'omit',cache:'no-store'});
    let reader=null;
    try {
      if(response.status!==200||response.redirected||(response.url&&response.url!==url)||!response.body?.getReader)throw new Error('page-response');
      const length=response.headers.get('content-length'),encoding=response.headers.get('content-encoding');
      if(encoding&&encoding.toLowerCase()!=='identity')throw new Error('page-encoding');
      if(length!==null&&(!/^\d+$/.test(length)||Number(length)!==d.jsonBytes))throw new Error('page-length');
      reader=response.body.getReader();const bytes=new Uint8Array(d.jsonBytes);let offset=0;
      for(;;) {const {value,done}=await reader.read();if(done)break;
        if(!(value instanceof Uint8Array)||offset+value.length>bytes.length)throw new Error('page-overflow');
        bytes.set(value,offset);offset+=value.length;}
      if(offset!==bytes.length||await sha(bytes)!==d.sha256)throw new Error('page-integrity');
      if(signal.aborted||disposed)throw new Error('aborted');
      const p=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      if(p.schema!==BATCH_PAGE_SCHEMA||p.revision!==revision||p.sourceSha256!==manifest.source.sha256
        ||p.catalogSha256!==manifest.catalogSha256||p.x!==d.x||p.y!==d.y
        ||!Array.isArray(p.tiles)||p.tiles.length>100)throw new Error('page-identity');
      const tiles=new Map();
      for(const t of p.tiles) {
        if(!t||!int(t.x,0,3599)||!int(t.y,0,1799)||Math.floor(t.x/10)!==d.x||Math.floor(t.y/10)!==d.y
          ||t.file!==`${t.x}-${t.y}.json.gz`||!hash(t.sha256)||!int(t.jsonBytes,1,MAX_TILE_JSON_BYTES)
          ||!int(t.gzipBytes,1,MAX_TILE_JSON_BYTES+4096))throw new Error('page-tile');
        const k=`${t.x}-${t.y}`;if(tiles.has(k))throw new Error('page-duplicate-tile');
        tiles.set(k,freeze({x:t.x,y:t.y,file:t.file,sha256:t.sha256,jsonBytes:t.jsonBytes,gzipBytes:t.gzipBytes}));
      }
      const parsed={tiles,bytes:d.jsonBytes};stats.verified++;
      if(maxCachedPages) {while(cache.size>=maxCachedPages) {const k=cache.keys().next().value;cacheBytes-=cache.get(k).bytes;cache.delete(k);stats.evictions++;}
        cache.set(key,parsed);cacheBytes+=parsed.bytes;stats.peakCachedPages=Math.max(stats.peakCachedPages,cache.size);stats.peakCachedBytes=Math.max(stats.peakCachedBytes,cacheBytes);}
      return parsed;
    } finally {if(reader){await reader.cancel().catch(()=>{});reader.releaseLock();}
      else if(response.body&&!response.body.locked)await response.body.cancel().catch(()=>{});}
  }
  async function resolve(tiles,{signal}={}) {
    if(disposed||signal?.aborted)return outcome('discarded','aborted');
    if(active){stats.busy++;return outcome('busy','manifest-admission');}
    if(!Array.isArray(tiles)||tiles.length>32||!tiles.every(t=>int(t?.x,0,3599)&&int(t?.y,0,1799)&&t.key===`${t.x}-${t.y}`)
      ||new Set(tiles.map(t=>t.key)).size!==tiles.length)throw new TypeError('Invalid bounded requested window');
    const wanted=tiles.map(t=>({x:t.x,y:t.y,key:t.key}));
    const controller=new AbortController();active=controller;const abort=()=>controller.abort();
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    const timer=setTimeout(abort,timeoutMs);stats.requests++;
    try {
      const groups=new Map();for(const t of wanted){const k=`${Math.floor(t.x/10)}-${Math.floor(t.y/10)}`;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(t);}
      const selected=new Map(),missing=[];
      for(const [key,group] of groups) {
        if(controller.signal.aborted)throw new Error('aborted');
        const p=await page(key,controller.signal);
        for(const t of group){const d=p?.tiles.get(t.key);if(d)selected.set(t.key,d);else missing.push(t.key);}
      }
      if(controller.signal.aborted||disposed)return outcome('discarded','aborted');
      // A fresh snapshot crosses the owner boundary; the cache cannot be poisoned.
      return outcome(missing.length?'missing':'resolved',missing.length?'undeclared-coverage':null,
        {revision,missing:freeze(missing),manifest:structuredClone({...manifest,tiles:wanted.flatMap(t=>selected.has(t.key)?[selected.get(t.key)]:[])})});
    } catch(error) {stats.rejected++;return outcome(controller.signal.aborted?'discarded':'rejected',controller.signal.aborted?'aborted':error.message);}
    finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);active=null;}
  }
  return freeze({resolve,revision,dispose(){disposed=true;active?.abort();cache.clear();cacheBytes=0;},
    diagnostics:()=>({...stats,disposed,active:active?1:0,directoryPages:pages.size,cachedPages:cache.size,cachedDeclaredBytes:cacheBytes,maxCachedPages,maxPageBytes:65536})});
}

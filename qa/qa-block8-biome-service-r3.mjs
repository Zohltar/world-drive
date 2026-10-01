import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {prepareBiomeService} from '../src/scenery/biomes/biome-service.js';
import {createPaletteRegistry, PALETTE_POLICIES} from '../src/scenery/biomes/palette-registry.js';
import {ATLAS_SCHEMA} from '../src/scenery/biomes/regional-classifier.js';
import {REFINEMENT_SCHEMA, MAX_TILE_JSON_BYTES} from '../src/scenery/biomes/local-refinement.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const encode = value => new TextEncoder().encode(JSON.stringify(value));
const clone = structuredClone;
const source = {id:'RESOLVE-ECOREGIONS-2017', license:'CC-BY-4.0', sha256:'a'.repeat(64)};
const records = [null, {id:0,biome:11,name:'Rock and Ice',realm:'Test'},
  ...Array.from({length:14}, (_, i) => ({id:i+1, biome:i+1, name:`Synthetic ${i+1}`, realm:'Test'}))];
const catalogSha256 = sha(encode(records));
const slot = biome => records.findIndex(r => r?.id === biome);
function tile(x = 1800, y = 900, label = slot(1)) {
  return {schema:REFINEMENT_SCHEMA, crs:'EPSG:4326', sourceSha256:source.sha256,
    catalogSha256, tileX:x, tileY:y, divisions:16,
    cellSlots:Array(256).fill(label), cellReasons:Array(256).fill(0), cellPolygonOffsets:Array(257).fill(0),
    polygonSlots:[], polygonRingOffsets:[0], ringPointOffsets:[0], coordinates:[]};
}
function fixture(tiles = [tile()]) {
  const payloads = tiles.map(encode);
  const refinementManifest = {schema:REFINEMENT_SCHEMA, source:clone(source), records:clone(records), catalogSha256,
    tiles:tiles.map((t, i) => ({x:t.tileX, y:t.tileY, file:`${t.tileX}-${t.tileY}.json.gz`,
      jsonBytes:payloads[i].byteLength, gzipBytes:100, sha256:sha(payloads[i])}))};
  const cells = new Uint16Array(360 * 180).fill(slot(6));
  const raw = Buffer.alloc(cells.length * 2);
  for (let i=0;i<cells.length;i++) raw.writeUInt16LE(cells[i], i*2);
  const regionalAtlas = {schema:ATLAS_SCHEMA, crs:'EPSG:4326', width:360, height:180,
    west:-180, north:90, cellDegrees:1, source:clone(source), records:clone(records), cells, cellSha256:sha(raw)};
  return {regionalAtlas, refinementManifest, payloads};
}
async function ready(tiles = [tile()], options = {}) {
  const f=fixture(tiles), s=await prepareBiomeService({...f, ...options});
  for (let i=0;i<tiles.length;i++) assert.equal((await s.prepareTile(`${tiles[i].tileX}-${tiles[i].tileY}`, f.payloads[i], s.routeToken())).status,'installed');
  return {s, f};
}
const asset = (id, palettes, kind='tree', extra={}) => ({id, palettes, kind, reviewed:true,
  provenanceId:'synthetic-fixture-only', weight:1, ...extra});
const opts = {placementAllowed:true, stableKey:'absolute-cell/0/0/candidate/42'};
let groups=0;
async function check(name, fn) {await fn(); groups++; console.log('PASS', name);}

await check('absent datasets remain neutral with no implicit loading', async()=> {
  const s=await prepareBiomeService();const r=s.query(45,-73);
  assert.equal(r.status,'unavailable');assert.equal(r.biome,0);assert.equal(r.paletteEligible,false);
  assert.equal(r.placementAuthority,false);assert.equal(s.requestFor(45,-73),null);s.dispose();
});
await check('coarse-only boreal context cannot authorize a palette',async()=> {
  const f=fixture(), s=await prepareBiomeService({regionalAtlas:f.regionalAtlas});const r=s.query(-.01,.01);
  assert.equal(r.regionalHint.family,'boreal');assert.equal(r.biome,0);assert.equal(r.paletteEligible,false);
  const p=createPaletteRegistry([asset('boreal-only',['boreal-conifer'])]);
  assert.equal(p.select(r,opts).assetId,null);s.dispose();
});
await check('regional hash and catalog hash are checked independently',async()=> {
  for (const mutate of [f=>f.regionalAtlas.cells[0]++,f=>f.regionalAtlas.cellSha256='b'.repeat(64),
    f=>f.refinementManifest.catalogSha256='b'.repeat(64)]) {
    const f=fixture();mutate(f);await assert.rejects(prepareBiomeService(f),/SHA-256/);
  }
});
await check('same-source but mismatched metadata or slots is refused',async()=> {
  for(const mutate of [f=>f.regionalAtlas.source.sha256='b'.repeat(64),
    f=>f.regionalAtlas.records[1].realm='Other',f=>f.regionalAtlas.records.reverse(),
    f=>f.regionalAtlas.source.id='Other']) {
    const f=fixture();mutate(f);await assert.rejects(prepareBiomeService(f));
  }
});
await check('manifest descriptor paths, count, bytes and duplicate keys are bounded',async()=> {
  for(const mutate of [m=>m.tiles[0].file='../data.gz',m=>m.tiles.push(m.tiles[0]),
    m=>m.tiles[0].jsonBytes=MAX_TILE_JSON_BYTES+1,m=>m.tiles[0].x=3600,
    m=>m.tiles[0].gzipBytes=0,m=>m.tiles=Array(129).fill(m.tiles[0])]) {
    const f=fixture();mutate(f.refinementManifest);await assert.rejects(prepareBiomeService(f));
  }
  await assert.rejects(prepareBiomeService({maxPendingTiles:0}));
  await assert.rejects(prepareBiomeService({maxPendingBytes:Infinity}));
});
await check('constructor snapshots survive mutations during asynchronous verification',async()=> {
  const f=fixture(), pending=prepareBiomeService(f), bytes=f.payloads[0];
  f.regionalAtlas.cells.fill(0);f.regionalAtlas.records[1].name='poison';
  f.refinementManifest.records[1].name='poison';f.refinementManifest.tiles[0].sha256='b'.repeat(64);
  const s=await pending;assert.equal((await s.prepareTile('1800-900',bytes,s.routeToken())).status,'installed');
  assert.equal(s.query(-.01,.01).family,'tropical');assert.equal(s.query(-1,1).regionalHint.family,'boreal');s.dispose();
});
const allTile=tile();for(let i=0;i<15;i++)allTile.cellSlots[i]=i+1;
const allService=(await ready([allTile])).s;
const contextFor = id => allService.query(-.003125, (slot(id)-1)*.00625+.003125);
await check('all fourteen local biomes override coarse boreal context without blending',()=> {
  for(let id=1;id<=14;id++) {const r=contextFor(id);assert.equal(r.biome,id);assert.equal(r.ecoregion.id,id);
    assert.equal(r.precision,'source-polygons');assert.equal(r.paletteEligible,true);assert.equal(r.transitionReady,false);}
});
await check('Rock and Ice special context keeps the raw source biome and ordinary tundra',()=> {
  const rock=contextFor(0),tundra=contextFor(11);
  assert.equal(rock.biome,98);assert.equal(rock.ecoregion.biome,11);assert.equal(tundra.biome,11);
  assert.equal(rock.placementAuthority,false);assert.equal(rock.elevationApplied,false);
});
await check('precise source no-data overrides coarse forest without nearest-land fallback',async()=> {
  const {s}=await ready([tile(1800,900,0)]);const r=s.query(-.01,.01);
  assert.equal(r.status,'no-data');assert.equal(r.reason,'source-no-data');assert.equal(r.regionalHint,null);s.dispose();
});
await check('every unresolved geometry reason remains uncertainty, not coarse authorization',async()=> {
  for(let reason=1;reason<=4;reason++) {const t=tile();t.cellSlots[0]=-2;t.cellReasons[0]=reason;
    const {s}=await ready([t]);const r=s.query(-.001,.001);assert.equal(r.status,'unavailable');
    assert.equal(r.paletteEligible,false);assert.equal(r.regionalHint.family,'boreal');s.dispose();}
});
await check('invalid query coordinates never clamp to a plausible biome',()=> {
  for(const p of [[NaN,0],[Infinity,0],[91,0],[0,181],[null,0],['0',0]]) {
    assert.equal(allService.query(...p).reason,'invalid-coordinate');}
});
await check('payload SHA mismatch rejects before changing a resident tile',async()=> {
  const {s,f}=await ready(), before=s.query(-.01,.01);const bytes=new Uint8Array(f.payloads[0]);bytes[0]^=1;
  assert.equal((await s.prepareTile('1800-900',bytes,s.routeToken())).reason,'tile-sha256');
  assert.deepEqual(s.query(-.01,.01),before);assert.equal(s.diagnostics().refinement.evictions,0);s.dispose();
});
await check('even correctly hashed bytes must match the manifest address and geometry',async()=> {
  for(const mutate of [t=>t.tileX=1801,t=>t.divisions=32,t=>t.cellSlots[0]=30000]) {
    const t=tile();mutate(t);const f=fixture([t]);f.refinementManifest.tiles[0].x=1800;
    f.refinementManifest.tiles[0].file='1800-900.json.gz';const s=await prepareBiomeService(f);
    assert.equal((await s.prepareTile('1800-900',f.payloads[0],s.routeToken())).status,'rejected');
    assert.equal(s.diagnostics().refinement.residentTiles,0);s.dispose();
  }
});
await check('invalid UTF-8 is refused even when the byte digest matches',async()=> {
  const f=fixture(), bytes=new Uint8Array([0xff]);f.refinementManifest.tiles[0].jsonBytes=1;
  f.refinementManifest.tiles[0].sha256=sha(bytes);const s=await prepareBiomeService(f);
  assert.equal((await s.prepareTile('1800-900',bytes,s.routeToken())).reason,'tile-validation');s.dispose();
});
await check('wrong size, shared memory and undeclared tile are refused without preparation',async()=> {
  const f=fixture(),s=await prepareBiomeService(f);
  assert.equal((await s.prepareTile('1800-900',new Uint8Array(MAX_TILE_JSON_BYTES+1),s.routeToken())).reason,'tile-byte-length');
  assert.equal((await s.prepareTile('x',f.payloads[0],s.routeToken())).reason,'tile-not-in-manifest');
  assert.equal((await s.prepareTile('1800-900',new Uint8Array(new SharedArrayBuffer(f.payloads[0].length)),s.routeToken())).status,'rejected');
  assert.equal(s.diagnostics().maxPendingTilesObserved,0);s.dispose();
});
await check('private payload snapshot prevents hash/parse mutation races',async()=> {
  const f=fixture(),s=await prepareBiomeService(f),p=s.prepareTile('1800-900',f.payloads[0],s.routeToken());
  f.payloads[0].fill(0);assert.equal((await p).status,'installed');assert.equal(s.query(-.01,.01).biome,1);s.dispose();
});
await check('route change discards in-flight old data and resets residency',async()=> {
  const f=fixture(),s=await prepareBiomeService(f),old=s.routeToken();
  const pending=s.prepareTile('1800-900',f.payloads[0],old), next=s.beginRoute();
  assert.equal((await pending).reason,'stale-route');assert.equal(s.diagnostics().refinement.residentTiles,0);
  assert.equal((await s.prepareTile('1800-900',f.payloads[0],{generation:next.generation})).reason,'stale-route');
  assert.equal((await s.prepareTile('1800-900',f.payloads[0],next)).status,'installed');s.dispose();
});
await check('disposal invalidates both pending work and future queries',async()=> {
  const f=fixture(),s=await prepareBiomeService(f),old=s.routeToken(),p=s.prepareTile('1800-900',f.payloads[0],old);
  s.dispose();assert.equal((await p).reason,'stale-route');assert.equal(s.query(-.01,.01).reason,'disposed');
  assert.equal(s.routeToken(),null);assert.equal(s.requestFor(-.01,.01),null);assert.throws(()=>s.beginRoute());
  assert.equal(s.diagnostics().pendingBytes,0);s.dispose();
});
await check('preparation rejects overflow instead of growing an asynchronous queue',async()=> {
  const f=fixture(),s=await prepareBiomeService({...f,maxPendingTiles:1});
  const work=Array.from({length:12},()=>s.prepareTile('1800-900',f.payloads[0],s.routeToken()));
  const result=await Promise.all(work);assert.equal(result.filter(r=>r.status==='installed').length,1);
  assert.equal(result.filter(r=>r.status==='busy').length,11);assert.equal(s.diagnostics().pendingTiles,0);
  assert.equal(s.diagnostics().maxPendingTilesObserved,1);s.dispose();
});
await check('byte budget and old-route pending work stay accounted',async()=> {
  const f=fixture(),s=await prepareBiomeService({...f,maxPendingBytes:f.payloads[0].byteLength});
  const p=s.prepareTile('1800-900',f.payloads[0],s.routeToken());s.beginRoute();
  assert.equal((await s.prepareTile('1800-900',f.payloads[0],s.routeToken())).status,'busy');
  await p;assert.equal(s.diagnostics().pendingBytes,0);
  assert.equal((await s.prepareTile('1800-900',f.payloads[0],s.routeToken())).status,'installed');s.dispose();
});
await check('frozen output/request metadata cannot alter source decisions',()=> {
  const r=contextFor(1);assert.throws(()=>{r.ecoregion.name='poison';});assert.throws(()=>{r.source.sha256='poison';});
  assert.throws(()=>{allService.requestFor(-.01,.01).file='poison';});assert.equal(contextFor(1).biome,1);
});
await check('cache eviction never promotes a coarse palette; reload preserves selection',async()=> {
  const f=fixture([tile(),tile(1801)]),s=await prepareBiomeService({...f,localOptions:{maxTiles:1}});
  const p=createPaletteRegistry([asset('tropical-tree',['tropical-moist-broadleaf'])]);
  await s.prepareTile('1800-900',f.payloads[0],s.routeToken());const before=p.select(s.query(-.01,.01),opts);
  await s.prepareTile('1801-900',f.payloads[1],s.routeToken());assert.equal(p.select(s.query(-.01,.01),opts).assetId,null);
  await s.prepareTile('1800-900',f.payloads[0],s.routeToken());assert.deepEqual(p.select(s.query(-.01,.01),opts),before);s.dispose();
});
await check('registry preserves fourteen distinct palette contracts and explicit no-tree policy',()=> {
  assert.equal(Object.keys(PALETTE_POLICIES).length,16);
  for(const name of ['tundra','montane-grassland','desert-xeric-scrub','rock-ice'])assert.equal(PALETTE_POLICIES[name].treePolicy,'none');
  assert.equal(PALETTE_POLICIES['tropical-savanna'].treePolicy,'sparse');
  assert.equal(PALETTE_POLICIES['tropical-moist-broadleaf'].densityScale,null);
});
await check('default registry invents no approved assets or GLB replacements',()=> {
  const p=createPaletteRegistry();assert.equal(p.diagnostics().assets,0);
  assert.equal(p.select(contextFor(1),opts).reason,'no-compatible-asset');
});
const registry=createPaletteRegistry([asset('boreal-only',['boreal-conifer']),
  asset('tropical-only',['tropical-moist-broadleaf']),asset('tropical-conifer-only',['tropical-conifer'])]);
await check('tropical and boreal conifers are separate; missing palette cannot borrow boreal assets',()=> {
  assert.equal(registry.select(contextFor(1),opts).assetId,'tropical-only');
  assert.equal(registry.select(contextFor(3),opts).assetId,'tropical-conifer-only');
  assert.equal(registry.select(contextFor(6),opts).assetId,'boreal-only');
  assert.equal(registry.select(contextFor(2),opts).assetId,null);
});
await check('desert/tundra/rock cannot silently select closed forest',()=> {
  for(const id of [0,10,11,13])assert.equal(registry.select(contextFor(id),opts).reason,'kind-not-allowed');
  assert.throws(()=>createPaletteRegistry([asset('invalid-tree',['desert-xeric-scrub'])]));
});
await check('placement authorization must come explicitly from existing exclusions',()=> {
  for(const placementAllowed of [undefined,false,0,1,'true',null]) {
    assert.equal(registry.select(contextFor(1),{...opts,placementAllowed}).reason,'placement-not-authorized');}
});
await check('registry rejects unsupported, wildcard, unreviewed and oversized metadata',()=> {
  for(const change of [a=>a.reviewed=false,a=>a.palettes=['*'],a=>a.weight=NaN,a=>a.weight=0,
    a=>a.provenanceId='',a=>a.palettes=['neutral-sparse'],a=>a.kind='car',a=>a.realms=[],a=>a.ecoregionIds=[-1]]) {
    const a=asset('test',['tropical-moist-broadleaf']);change(a);assert.throws(()=>createPaletteRegistry([a]));}
  const a=asset('test',['tropical-moist-broadleaf']);assert.throws(()=>createPaletteRegistry([a,a]));
  assert.throws(()=>createPaletteRegistry(Array.from({length:129},(_,i)=>asset(`test-${i}`,a.palettes))));
  assert.throws(()=>createPaletteRegistry(Array(257).fill(a)));
});
await check('realm and ecoregion restrictions apply before weighted choice',()=> {
  const p=createPaletteRegistry([asset('wrong-realm',['tropical-moist-broadleaf'],'tree',{realms:['Other']}),
    asset('wrong-region',['tropical-moist-broadleaf'],'tree',{ecoregionIds:[20]}),
    asset('right-region',['tropical-moist-broadleaf'],'tree',{realms:['Test'],ecoregionIds:[1]})]);
  assert.equal(p.select(contextFor(1),opts).assetId,'right-region');
});
await check('asset and palette output snapshots cannot be caller-mutated',()=> {
  const a=asset('ok',['tropical-moist-broadleaf']),p=createPaletteRegistry([a]);
  a.palettes[0]='boreal-conifer';a.id='poison';assert.equal(p.select(contextFor(1),opts).assetId,'ok');
  assert.throws(()=>{p.policy('tropical-moist-broadleaf').allowedKinds.push('car');});
});
await check('weighted choice is deterministic across ordering, call order and cache history',()=> {
  const assets=[asset('A',['tropical-moist-broadleaf']),asset('B',['tropical-moist-broadleaf'],'tree',{weight:7})];
  const a=createPaletteRegistry(assets),b=createPaletteRegistry(assets.toReversed()),seen=new Set();
  for(let i=0;i<1000;i++) {const o={...opts,stableKey:`absolute-candidate/${i}`};
    assert.deepEqual(a.select(contextFor(1),o),b.select(contextFor(1),o));seen.add(a.select(contextFor(1),o).assetId);}
  assert.deepEqual([...seen].sort(),['A','B']);
});
await check('coarse transition mixes and artificial cell-edge flags cannot select neighboring assets',()=> {
  const c={...contextFor(1),mix:[{biome:6,weight:1}],boundaryDiagnostic:true,transitionReady:false};
  assert.equal(registry.select(c,opts).assetId,'tropical-only');
  assert.equal(registry.select({...c,palette:'boreal-conifer'},opts).assetId,null);
  assert.equal(registry.select({...c,biome:6},opts).assetId,null);
  assert.equal(registry.select({...c,precision:'regional-grid'},opts).assetId,null);
});
await check('invalid stable identifiers are refused rather than using random state',()=> {
  for(const stableKey of ['',null,1,'a'.repeat(257)])assert.equal(registry.select(contextFor(1),{...opts,stableKey}).reason,'invalid-stable-key');
});
await check('query and selection never invoke network/timers/idle work',()=> {
  const fetch=globalThis.fetch,timeout=globalThis.setTimeout,random=Math.random;
  const fail=()=>{throw new Error('Forbidden query-side work');};
  try{globalThis.fetch=fail;globalThis.setTimeout=fail;Math.random=fail;
    assert.equal(registry.select(contextFor(1),opts).assetId,'tropical-only');
  }finally{globalThis.fetch=fetch;globalThis.setTimeout=timeout;Math.random=random;}
});
await check('100k maintained service+palette queries remain bounded (timing diagnostic only)',()=> {
  const start=performance.now();
  for(let i=0;i<100000;i++)assert.equal(registry.select(contextFor(1),{...opts,stableKey:`absolute/${i}`}).assetId,'tropical-only');
  const d=allService.diagnostics();assert.equal(d.pendingTiles,0);assert.ok(d.refinement.residentTiles<=8);
  assert.ok(d.refinement.maxEdgesTested<=512);assert.equal(d.regional.queries,0);
  console.log(JSON.stringify({queries:100000,elapsedMs:performance.now()-start,refinement:d.refinement}));
});
allService.dispose();
console.log(`PASS Block 8 biome service/palettes R3: ${groups} groups (synthetic; no visual certification)`);

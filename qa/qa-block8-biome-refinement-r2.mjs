import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createLocalRefinement, refinementAddress, parseRefinementTile,
  REFINEMENT_SCHEMA, MAX_TILE_JSON_BYTES} from '../tools/biomes/local-refinement-prototype.mjs';

const sha = data => createHash('sha256').update(data).digest('hex');
const clone = value => structuredClone(value);
const sourceSha = 'a'.repeat(64);
const records = [null, {id:1,biome:1,name:'Tropical',realm:'Test'},
  {id:2,biome:13,name:'Desert',realm:'Test'}];
const manifest = {schema:REFINEMENT_SCHEMA, source:{id:'RESOLVE-ECOREGIONS-2017',
  license:'CC-BY-4.0',sha256:sourceSha}, records, catalogSha256:sha(JSON.stringify(records))};
function uniform(x=1800,y=900,slot=1) {
  return {schema:REFINEMENT_SCHEMA, crs:'EPSG:4326', sourceSha256:sourceSha,
    catalogSha256:manifest.catalogSha256, tileX:x,tileY:y,divisions:16,
    cellSlots:Array(256).fill(slot),cellReasons:Array(256).fill(0),cellPolygonOffsets:Array(257).fill(0),
    polygonSlots:[],polygonRingOffsets:[0],ringPointOffsets:[0],coordinates:[]};
}
function vector(polygons) {
  const t=uniform(1800,900,0); t.cellSlots[0]=-1;
  for(const [slot,rings] of polygons) {
    t.polygonSlots.push(slot);
    for(const ring of rings) { t.coordinates.push(...ring.flat()); t.ringPointOffsets.push(t.coordinates.length/2); }
    t.polygonRingOffsets.push(t.ringPointOffsets.length-1);
  }
  t.cellPolygonOffsets.fill(polygons.length,1);
  return t;
}
const outer=[[0,0],[.00625,0],[.00625,-.00625],[0,-.00625],[0,0]];
const hole=[[.002,-.002],[.004,-.002],[.004,-.004],[.002,-.004],[.002,-.002]];
let groups=0;
function check(name,fn) { fn();groups++;console.log('PASS',name); }
function selfTests() {
  check('missing tile does not fabricate or load land',()=> {
    const s=createLocalRefinement(manifest);assert.equal(s.query(0,0).reason,'tile-not-loaded');assert.equal(s.diagnostics().residentTiles,0);
  });
  check('uniform exact cell and explicit source no-data',()=> {
    const s=createLocalRefinement(manifest);s.install(uniform());assert.equal(s.query(-.01,.01).slot,1);
    s.install(uniform(1800,900,0));const r=s.query(-.01,.01);assert.equal(r.status,'no-data');assert.equal(r.slot,0);
  });
  check('source polygon outer, hole, hole edge, orientation',()=> {
    for(const rings of [[outer,hole],[outer.toReversed(),hole.toReversed()]]) {
      const s=createLocalRefinement(manifest);s.install(vector([[1,rings]]));
      assert.equal(s.query(-.001,.001).slot,1);assert.equal(s.query(-.003,.003).slot,0);
      assert.equal(s.query(-.002,.003).slot,1);assert.equal(s.query(-.002,.003).boundary,true);
    }
  });
  check('overlap uses highest record id independent of polygon order',()=> {
    for(const p of [[[1,[outer]],[2,[outer]]],[[2,[outer]],[1,[outer]]]]) {
      const s=createLocalRefinement(manifest);s.install(vector(p));assert.equal(s.query(-.001,.001).slot,2);
    }
  });
  check('degenerate/invalid/budget cells are unavailable not source no-data',()=> {
    for(let reason=1;reason<=4;reason++) {const t=uniform();t.cellSlots[0]=-2;t.cellReasons[0]=reason;
      const s=createLocalRefinement(manifest);s.install(t);assert.equal(s.query(-.001,.001).status,'unavailable');}
  });
  check('poles and equivalent dateline address',()=> {
    assert.deepEqual(refinementAddress(10,-180),refinementAddress(10,180));
    assert.equal(refinementAddress(90,0).y,0);assert.equal(refinementAddress(-90,0).y,1799);
    const s=createLocalRefinement(manifest);s.install(uniform(0,800));assert.deepEqual(s.query(10,-180),s.query(10,180));
  });
  check('adjacent tile seam ownership',()=> {
    const s=createLocalRefinement(manifest);s.install(uniform(1799,900,1));s.install(uniform(1800,900,2));
    assert.equal(s.query(-.001,-1e-8).slot,1);assert.equal(s.query(-.001,0).slot,2);
  });
  check('bad coordinates are safe',()=> {const s=createLocalRefinement(manifest);
    for(const p of [[NaN,0],[Infinity,0],[91,0],[0,181],[null,0],['0',0]])assert.equal(s.query(...p).reason,'invalid-coordinate');
  });
  check('resident data and catalog cannot be mutated through input/output',()=> {
    const m=clone(manifest),s=createLocalRefinement(m),t=vector([[1,[outer]]]);s.install(t);
    t.coordinates.fill(0);m.records[1].name='poison';assert.equal(s.query(-.001,.001).ecoregion.name,'Tropical');
    assert.throws(()=>{s.query(-.001,.001).ecoregion.name='poison';});
  });
  check('tile-count LRU bound and reloading determinism',()=> {
    const s=createLocalRefinement(manifest,{maxTiles:2});s.install(uniform());s.install(uniform(1801));
    const original=s.query(-.01,.01);s.install(uniform(1802));assert.equal(s.query(-.01,.11).reason,'tile-not-loaded');
    assert.deepEqual(s.query(-.01,.01),original);assert.equal(s.diagnostics().evictions,1);
  });
  check('payload byte bound, clear and atomic rejection',()=> {
    const s=createLocalRefinement(manifest,{maxBytes:2048});s.install(uniform());
    assert.throws(()=>s.install(vector([[1,[outer,hole]],[2,[outer]]])) ,/budget/);
    assert.equal(s.query(-.001,.001).slot,1);s.install(uniform(1801));assert.equal(s.diagnostics().residentTiles,1);
    s.clear();assert.equal(s.diagnostics().residentArrayBytes,0);
  });
  check('identity and malformed offsets fail closed',()=> {
    for(const mutate of [t=>t.sourceSha256='b'.repeat(64),t=>t.catalogSha256='c'.repeat(64),
      t=>t.cellPolygonOffsets[1]=1,t=>t.divisions=32,t=>t.tileX=3600,t=>t.cellSlots[0]=4000,
      t=>t.cellSlots[0]=-2,t=>t.coordinates=[NaN,0]]) {
      const t=uniform();mutate(t);assert.throws(()=>createLocalRefinement(manifest).install(t));
    }
  });
  check('geometry outside subcell, unclosed rings and nonfinite coordinates rejected',()=> {
    for(const mutate of [t=>t.coordinates[0]=1,t=>t.coordinates[0]=NaN,t=>t.coordinates[2]=Infinity,
      t=>t.coordinates[t.coordinates.length-1]=.1,t=>t.polygonRingOffsets[1]=0]) {
      const t=vector([[1,[outer]]]);mutate(t);assert.throws(()=>createLocalRefinement(manifest).install(t));
    }
  });
  check('512-edge runtime ceiling enforced before installation',()=> {
    const p=Array.from({length:520},(_,i)=>[.003+.002*Math.cos(i/520*2*Math.PI),-.003+.002*Math.sin(i/520*2*Math.PI)]);p.push(p[0]);
    assert.throws(()=>createLocalRefinement(manifest).install(vector([[1,[p]]])),/512/);
  });
  check('bounded parsing and invalid catalogs/options',()=> {
    assert.throws(()=>parseRefinementTile(' '.repeat(MAX_TILE_JSON_BYTES+1)));
    assert.throws(()=>parseRefinementTile('{bad'));
    assert.deepEqual(parseRefinementTile(JSON.stringify(uniform())),uniform());
    for(const o of [{maxTiles:0},{maxTiles:33},{maxBytes:2047},{maxBytes:Infinity}])assert.throws(()=>createLocalRefinement(manifest,o));
    for(const mutate of [m=>m.records.push(m.records[1]),m=>m.records[1].biome=50,m=>m.source.sha256='x',
      m=>m.records.reverse()]){const m=clone(manifest);mutate(m);assert.throws(()=>createLocalRefinement(m));}
  });
  check('100k deterministic geometry queries remain bounded',()=> {
    const s=createLocalRefinement(manifest);s.install(vector([[1,[outer,hole]]]));
    for(let i=0;i<100000;i++)assert.equal(s.query(-.001,.001).slot,1);
    const d=s.diagnostics();assert.equal(d.queries,100000);assert.ok(d.maxEdgesTested<=512);assert.equal(d.residentTiles,1);
  });
  console.log(`PASS Block 8 local refinement: ${groups} groups`);
}

function evaluate(directory, positionsPath, output) {
  const m=JSON.parse(readFileSync(join(directory,'manifest.json'),'utf8'));
  assert.equal(sha(JSON.stringify(m.records)),m.catalogSha256);
  const entries=new Map(m.tiles.map(e=>[`${e.x}-${e.y}`,e]));
  const service=createLocalRefinement(m), positions=JSON.parse(readFileSync(positionsPath,'utf8'));
  const ordered=positions.map((p,i)=>({p,i,key:refinementAddress(p[1],p[0]).key})).sort((a,b)=>a.key.localeCompare(b.key));
  const results=Array(positions.length);let loads=0,loadMs=0;
  for(const {p,i,key} of ordered) {
    let r=service.query(p[1],p[0]);
    if(r.reason==='tile-not-loaded') {
      const e=entries.get(key);assert.ok(e,`missing authoring tile ${key}`);
      assert.equal(e.file,`${key}.json.gz`);assert.ok(e.jsonBytes<=MAX_TILE_JSON_BYTES);
      const start=performance.now();
      const raw=gunzipSync(readFileSync(join(directory,e.file)),{maxOutputLength:MAX_TILE_JSON_BYTES});
      assert.equal(raw.length,e.jsonBytes);assert.equal(sha(raw),e.sha256);
      service.install(parseRefinementTile(raw.toString('utf8')));loadMs+=performance.now()-start;loads++;
      r=service.query(p[1],p[0]);
    }
    results[i]={slot:r.slot,status:r.status,reason:r.reason,boundary:r.boundary??false};
    assert.equal(r.placementAuthority,false);assert.equal(r.elevationApplied,false);
  }
  // Pure query stress on one already resident location; no load/decode in timer.
  const p=ordered.at(-1).p, expected=service.query(p[1],p[0]),start=performance.now();
  for(let i=0;i<100000;i++)assert.deepEqual(service.query(p[1],p[0]),expected);
  const d=service.diagnostics();assert.ok(d.maxEdgesTested<=512);assert.ok(d.residentArrayBytes<=d.maxBytes);assert.ok(d.residentTiles<=8);
  const report={results,loads,loadMs,query100kWithAssertionsMs:performance.now()-start,diagnostics:d,
    limitations:['Timing includes test assertions, not a browser/GPU frame-pacing benchmark',
      'Typed-array byte ceiling does not include parser/transient buffers or JS engine overhead']};
  writeFileSync(output,JSON.stringify(report));
  console.log(`PASS JS bounded refinement evaluation: ${results.length} positions, ${loads} loads, max ${d.maxEdgesTested} edges`);
}
if(process.argv[2]==='--evaluate')evaluate(...process.argv.slice(3));else selfTests();

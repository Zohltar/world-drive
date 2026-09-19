// Exercise the maintained service + integrity preparation using unchanged R2
// source-agreement points, plus MOCK asset eligibility. No real model is approved.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {performance} from 'node:perf_hooks';
import {prepareBiomeService} from '../src/scenery/biomes/biome-service.js';
import {createPaletteRegistry, PALETTE_POLICIES} from '../src/scenery/biomes/palette-registry.js';
import {biomeIdForRecord} from '../src/scenery/biomes/biome-profiles.js';
const [atlasPath,refinementPath]=process.argv.slice(2);
assert.ok(atlasPath&&refinementPath,'Usage: node qa/qa-block8-biome-service-real-r3.mjs ATLAS_DIR R2_REFINEMENT_DIR');
const json=path=>JSON.parse(readFileSync(path,'utf8'));
const manifest=json(join(atlasPath,'manifest.json'));
const raw=gunzipSync(readFileSync(join(atlasPath,'cells.u16le.gz')),{maxOutputLength:12_960_000});
assert.equal(manifest.cellDegrees,0.1);
assert.equal(raw.byteLength,manifest.width*manifest.height*2);
const cells=new Uint16Array(raw.length/2);for(let i=0;i<cells.length;i++)cells[i]=raw.readUInt16LE(i*2);
const localManifest=json(join(refinementPath,'manifest.json'));
const start=performance.now();
const service=await prepareBiomeService({regionalAtlas:{...manifest,cells},refinementManifest:localManifest});
const initializationMs=performance.now()-start;
const expected=json(join(refinementPath,'js-evaluation.json')).results;
const points=json(join(refinementPath,'qa-points.json'));
assert.equal(points.length,6327);assert.equal(expected.length,points.length);
const mockAssets=Object.values(PALETTE_POLICIES).filter(p=>p.id!=='neutral-sparse').flatMap(p=>
  p.allowedKinds.map(kind=>({id:`MOCK-${p.id}-${kind}`,kind,palettes:[p.id],weight:1,
    reviewed:true,provenanceId:'synthetic-fixture-only'})));
const registry=createPaletteRegistry(mockAssets);
const emptyRegistry=createPaletteRegistry();
let loads=0, resolved=0, noData=0, mockSelections=0, skippedTrees=0;
const families={},results=[];
for(let i=0;i<points.length;i++) {
  const [lon,lat]=points[i];let context=service.query(lat,lon);
  if(context.status==='unavailable') {
    assert.equal(context.paletteEligible,false);
    assert.equal(registry.select(context,{placementAllowed:true,stableKey:`point-${i}`}).assetId,null);
    const request=service.requestFor(lat,lon);assert.ok(request,`No declared tile at ${lat},${lon}`);
    const gzip=readFileSync(join(refinementPath,request.file));assert.equal(gzip.byteLength,request.gzipBytes);
    const bytes=gunzipSync(gzip,{maxOutputLength:request.jsonBytes});
    assert.equal((await service.prepareTile(request.key,bytes,service.routeToken())).status,'installed');loads++;
    context=service.query(lat,lon);
  }
  const record=localManifest.records[expected[i].slot];
  assert.equal(context.ecoregion?.id??null,record?.id??null,`R3 changed the R2 record at ${lat},${lon}`);
  assert.equal(context.biome,biomeIdForRecord(record,localManifest.source.id));
  assert.equal(context.placementAuthority,false);assert.equal(context.elevationApplied,false);
  assert.equal(context.transitionReady,false);
  assert.equal(emptyRegistry.select(context,{placementAllowed:true,stableKey:`point-${i}`}).assetId,null);
  assert.equal(registry.select(context,{stableKey:`point-${i}`}).assetId,null);
  if(record) {
    resolved++;families[context.family]=(families[context.family]??0)+1;
    const policy=registry.policy(context.palette);
    const selection=registry.select(context,{placementAllowed:true,stableKey:`point-${i}`});
    if(policy.allowedKinds.includes('tree')) {
      assert.equal(selection.assetId,`MOCK-${context.palette}-tree`);mockSelections++;
    }else{assert.equal(selection.assetId,null);skippedTrees++;}
    assert.notEqual(context.family==='tropical'&&selection.paletteId==='boreal-conifer',true);
    results.push({id:record.id,biome:context.biome,palette:context.palette});
  }else{noData++;assert.equal(context.status,'no-data');results.push(null);}
}
const after=service.diagnostics();assert.ok(after.refinement.maxEdgesTested<=512);
assert.ok(after.refinement.residentTiles<=8);assert.ok(after.maxPendingTilesObserved<=2);
// Original Baffin control and ORIGINAL 201-point transect retain their indices.
assert.equal(results[6201].id,415);assert.ok(results.slice(6000,6201).every(Boolean));
const t=service.routeToken(), first=service.requestFor(points[0][1],points[0][0]);
service.beginRoute();assert.equal(service.query(points[0][1],points[0][0]).paletteEligible,false);
const bytes=gunzipSync(readFileSync(join(refinementPath,first.file)),{maxOutputLength:first.jsonBytes});
assert.equal((await service.prepareTile(first.key,bytes,t)).reason,'stale-route');
assert.equal((await service.prepareTile(first.key,bytes,service.routeToken())).status,'installed');
const restored=service.query(points[0][1],points[0][0]);assert.equal(restored.ecoregion?.id??null,results[0]?.id??null);
const report={positions:points.length,sourceRecordMismatches:0,resolved,noData,families,
  originalBaffinRecord:results[6201],originalYungasPositions:201,loads,mockSelections,skippedTrees,
  initializationMs,elapsedMs:performance.now()-start,diagnostics:service.diagnostics(),
  limitations:['Mock asset IDs only; no production models registered or activated',
    'Agreement with R2/RESOLVE, not field ecology or tree-cover validation',
    'Transport and bounded decompression are supplied by this Node test harness',
    'No continuous-route coverage planner, transition blending or elevation policy',
    'Timing is not a browser/GPU/frame-pacing benchmark']};
writeFileSync(join(refinementPath,'service-palette-r3-qa.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));service.dispose();
console.log(`PASS maintained biome service R3: ${points.length} real positions; no source-record mismatch`);

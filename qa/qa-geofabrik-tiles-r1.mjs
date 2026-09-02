import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildFromGeoJSONSeq,
  classifyFeature,
  tileForLonLat
} from '../tools/geofabrik/build-world-tiles.mjs';
import {
  createOfflineOsmTileSource,
  offlineTileForLatLon
} from '../src/osm-offline-tile-source.js';

function feature(id,geometry,properties={}){
  return {type:'Feature',id,geometry,properties};
}

const fixture=[
  feature('way/water-area',{
    type:'Polygon',
    coordinates:[[[-73.590,45.500],[-73.570,45.500],[-73.570,45.515],[-73.590,45.515],[-73.590,45.500]]]
  },{natural:'water',name:'Test Lake',source:'should-drop'}),
  feature('way/river',{
    type:'LineString',coordinates:[[-73.590,45.505],[-73.560,45.510]]
  },{waterway:'river',name:'Test River'}),
  feature('way/bridge',{
    type:'LineString',coordinates:[[-73.582,45.507],[-73.578,45.507]]
  },{highway:'secondary',bridge:'yes',surface:'asphalt'}),
  feature('way/building',{
    type:'Polygon',coordinates:[[[-73.581,45.506],[-73.580,45.506],[-73.580,45.507],[-73.581,45.507],[-73.581,45.506]]]
  },{building:'yes',name:'Test Building'}),
  feature('way/forest',{
    type:'Polygon',coordinates:[[[-73.586,45.512],[-73.584,45.512],[-73.584,45.514],[-73.586,45.514],[-73.586,45.512]]]
  },{landuse:'forest'}),
  feature('way/power',{
    type:'LineString',coordinates:[[-73.588,45.502],[-73.580,45.503]]
  },{power:'line'}),
  feature('way/dam',{
    type:'LineString',coordinates:[[-73.576,45.501],[-73.574,45.501]]
  },{man_made:'dam'}),
  feature('way/rail',{
    type:'LineString',coordinates:[[-73.583,45.509],[-73.579,45.509]]
  },{barrier:'guard_rail'}),
  feature('node/sign',{
    type:'Point',coordinates:[-73.579,45.508]
  },{highway:'traffic_sign',traffic_sign:'CA:stop'}),
  feature('way/irrelevant',{
    type:'LineString',coordinates:[[-73.590,45.520],[-73.580,45.520]]
  },{railway:'rail'})
];

assert.deepEqual(classifyFeature(fixture[0]),['water']);
assert.deepEqual(classifyFeature(fixture[2]),['bridge']);
assert.deepEqual(classifyFeature(fixture[9]),[]);

const tmp=await fsp.mkdtemp(path.join(os.tmpdir(),'world-drive-geofabrik-'));
const seq=path.join(tmp,'fixture.geojsonseq');
const out=path.join(tmp,'tiles');
await fsp.writeFile(
  seq,
  fixture.map(item=>'\x1e'+JSON.stringify(item)).join('\n')+'\n',
  'utf8'
);

try{
  const manifest=await buildFromGeoJSONSeq({
    input:seq,
    outDir:out,
    tileSizeMeters:2000,
    overwrite:true,
    source:'qa-fixture'
  });

  assert.equal(manifest.format,'world-drive-osm-jsonl-v1');
  assert.equal(manifest.inputFeatures,10);
  assert.equal(manifest.emittedFeatures,9);
  assert.equal(manifest.oversizeFeatures,0);
  assert.ok(manifest.tileCount>=1);
  assert.equal(manifest.categoryCounts.water,1);
  assert.equal(manifest.categoryCounts.waterway,1);
  assert.equal(manifest.categoryCounts.bridge,1);
  assert.equal(manifest.categoryCounts.building,1);
  assert.equal(manifest.categoryCounts.landuse,1);
  assert.equal(manifest.categoryCounts.power,1);
  assert.equal(manifest.categoryCounts.dam,1);
  assert.equal(manifest.categoryCounts.barrier,1);
  assert.equal(manifest.categoryCounts.sign,1);

  const center=tileForLonLat(-73.58,45.507,2000);
  const center2=offlineTileForLatLon(45.507,-73.58,2000);
  assert.deepEqual(center2,center,'builder and runtime tile math must match');

  const allRecords=[];
  async function walk(dir){
    for(const entry of await fsp.readdir(dir,{withFileTypes:true})){
      const file=path.join(dir,entry.name);
      if(entry.isDirectory())await walk(file);
      else if(entry.name.endsWith('.jsonl')){
        const text=await fsp.readFile(file,'utf8');
        for(const line of text.split(/\r?\n/)){
          if(line.trim())allRecords.push(JSON.parse(line));
        }
      }
    }
  }
  await walk(path.join(out,'tiles'));

  const ids=new Set(allRecords.map(record=>record.id));
  assert.ok(ids.has('way/water-area'));
  assert.ok(ids.has('way/river'));
  assert.ok(ids.has('way/bridge'));
  assert.ok(ids.has('node/sign'));
  assert.ok(!ids.has('way/irrelevant'));

  const waterRecord=allRecords.find(record=>record.id==='way/water-area');
  assert.equal(waterRecord.t.name,'Test Lake');
  assert.equal(waterRecord.t.source,undefined,'non-whitelisted tags must be dropped');
  assert.deepEqual(waterRecord.k,['water']);

  const rootUrl='http://world-drive.test/world-data/osm/quebec';
  const fetchImpl=async url=>{
    const parsed=new URL(url);
    const prefix='/world-data/osm/quebec/';
    assert.ok(parsed.pathname.startsWith(prefix));
    const relative=parsed.pathname.slice(prefix.length);
    const file=path.join(out,...relative.split('/'));
    if(!fs.existsSync(file)){
      return {ok:false,status:404,text:async()=>'',json:async()=>null};
    }
    const text=await fsp.readFile(file,'utf8');
    return {
      ok:true,
      status:200,
      text:async()=>text,
      json:async()=>JSON.parse(text)
    };
  };

  const source=createOfflineOsmTileSource({baseUrl:rootUrl,fetchImpl});
  const loaded=await source.loadAround(45.507,-73.58,3500);
  const loadedIds=new Set(loaded.records.map(record=>record.id));
  assert.ok(loadedIds.has('way/water-area'));
  assert.ok(loadedIds.has('way/river'));
  assert.ok(loadedIds.has('way/bridge'));
  assert.equal(
    loaded.records.length,
    loadedIds.size,
    'records duplicated across tiles must be deduplicated at runtime'
  );

  await source.loadAround(45.507,-73.58,3500);
  assert.ok(source.diagnostics().tileHits>0,'second load should reuse tile cache');

  console.log('Geofabrik tile pipeline QA PASS',JSON.stringify({
    tileCount:manifest.tileCount,
    tileRecords:manifest.tileRecords,
    loadedRecords:loaded.records.length
  }));
}finally{
  await fsp.rm(tmp,{recursive:true,force:true});
}

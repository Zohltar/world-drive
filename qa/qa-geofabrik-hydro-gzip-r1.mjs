import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {buildFromGeoJSONSeq} from '../tools/geofabrik/build-world-tiles.mjs';
import {packHydroGzipV2,decodeHydroTileGzip} from '../tools/geofabrik/pack-hydro-gzip-v2.mjs';

const root=await fsp.mkdtemp(path.join(os.tmpdir(),'wd-geofabrik-hydro-gzip-'));
const seq=path.join(root,'source.geojsonseq');
const v1=path.join(root,'v1');
const v2=path.join(root,'v2');

const features=[
  {
    type:'Feature',id:'way/water',properties:{natural:'water',name:'Test Lake'},
    geometry:{type:'Polygon',coordinates:[[[0,0],[0.01,0],[0.01,0.01],[0,0.01],[0,0]]]}
  },
  {
    type:'Feature',id:'way/river',properties:{waterway:'river',name:'Test River'},
    geometry:{type:'LineString',coordinates:[[0.002,0.002],[0.02,0.02]]}
  },
  {
    type:'Feature',id:'way/bridge',properties:{highway:'primary',bridge:'yes',name:'Test Bridge'},
    geometry:{type:'LineString',coordinates:[[0.003,0.003],[0.004,0.004]]}
  },
  {
    type:'Feature',id:'way/building',properties:{building:'yes',name:'Not Hydro'},
    geometry:{type:'Polygon',coordinates:[[[0.005,0.005],[0.006,0.005],[0.006,0.006],[0.005,0.006],[0.005,0.005]]]}
  }
];

await fsp.writeFile(seq,features.map(feature=>JSON.stringify(feature)).join('\n')+'\n','utf8');

try{
  const built=await buildFromGeoJSONSeq({
    input:seq,
    outDir:v1,
    tileSizeMeters:16000,
    overwrite:true,
    source:'QA fixture'
  });
  assert.equal(built.emittedFeatures,4);

  const packed=await packHydroGzipV2({
    inputDir:v1,
    outDir:v2,
    overwrite:true,
    progressEvery:0,
    log:()=>{}
  });

  assert.equal(packed.format,'world-drive-osm-hydro-jsonl-gzip-v2');
  assert.equal(packed.parseErrors,0);
  assert.ok(packed.records>=3,'tile records may duplicate a feature across spatial cells');
  assert.ok(packed.tileCount>=1);
  assert.ok(packed.compressedBytes>0);

  const indexSource=await fsp.readFile(path.join(v2,'tiles-index.jsonl'),'utf8');
  const index=indexSource.trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  const decoded=[];
  for(const tile of index){
    const compressed=await fsp.readFile(path.join(v2,'tiles',String(tile.x),`${tile.y}.jsonl.gz`));
    const text=decodeHydroTileGzip(compressed).trim();
    if(!text)continue;
    decoded.push(...text.split(/\r?\n/).map(line=>JSON.parse(line)));
  }

  const ids=new Set(decoded.map(record=>record.id));
  assert.deepEqual([...ids].sort(),['way/bridge','way/river','way/water']);
  assert.ok(!ids.has('way/building'));

  const manifest=JSON.parse(await fsp.readFile(path.join(v2,'manifest.json'),'utf8'));
  assert.deepEqual(manifest.categories,['water','waterway','bridge','dam']);
  assert.equal(manifest.compression,'gzip');
  assert.equal(manifest.records,packed.records);

  console.log('Geofabrik hydro gzip QA PASS',JSON.stringify({
    tileRecords:packed.records,
    uniqueHydroFeatures:ids.size,
    tileCount:packed.tileCount,
    reductionPercent:packed.reductionPercent
  }));
}finally{
  await fsp.rm(root,{recursive:true,force:true});
}

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
  assert.equal(packed.records,3);
  assert.ok(packed.tileCount>=1);
  assert.ok(packed.compressedBytes>0);
  assert.ok(packed.compressedBytes<packed.uncompressedBytes);
  assert.ok(packed.reductionPercent>0);

  const indexSource=await fsp.readFile(path.join(v2,'tiles-index.jsonl'),'utf8');
  const first=JSON.parse(indexSource.trim().split(/\r?\n/)[0]);
  const compressed=await fsp.readFile(path.join(v2,'tiles',String(first.x),`${first.y}.jsonl.gz`));
  const decoded=decodeHydroTileGzip(compressed)
    .trim()
    .split(/\r?\n/)
    .map(line=>JSON.parse(line));

  assert.ok(decoded.some(record=>record.id==='way/water'));
  assert.ok(decoded.some(record=>record.id==='way/river'));
  assert.ok(decoded.some(record=>record.id==='way/bridge'));
  assert.ok(!decoded.some(record=>record.id==='way/building'));

  const manifest=JSON.parse(await fsp.readFile(path.join(v2,'manifest.json'),'utf8'));
  assert.deepEqual(manifest.categories,['water','waterway','bridge','dam']);
  assert.equal(manifest.compression,'gzip');

  console.log('Geofabrik hydro gzip QA PASS',JSON.stringify({
    records:packed.records,
    tileCount:packed.tileCount,
    reductionPercent:packed.reductionPercent
  }));
}finally{
  await fsp.rm(root,{recursive:true,force:true});
}

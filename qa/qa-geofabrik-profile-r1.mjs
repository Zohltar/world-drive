import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import {profileWorldTiles} from '../tools/geofabrik/profile-world-tiles.mjs';

const root=await fsp.mkdtemp(path.join(os.tmpdir(),'wd-geofabrik-profile-'));
try{
  await fsp.mkdir(path.join(root,'tiles','1'),{recursive:true});
  await fsp.mkdir(path.join(root,'tiles','2'),{recursive:true});

  await fsp.writeFile(path.join(root,'manifest.json'),JSON.stringify({
    format:'world-drive-osm-jsonl-v1',
    generatedAt:'2026-09-02T00:00:00.000Z',
    tileSizeMeters:16000
  })+'\n');
  await fsp.writeFile(path.join(root,'tiles-index.jsonl'),
    JSON.stringify({x:1,y:1,records:3})+'\n'+
    JSON.stringify({x:2,y:2,records:2})+'\n');

  const hydro1={v:1,id:'a',k:['water'],g:{type:'Point',coordinates:[0,0]},t:{natural:'water'}};
  const scenery1={v:1,id:'b',k:['building'],g:{type:'Point',coordinates:[0,0]},t:{building:'yes'}};
  const shared={v:1,id:'c',k:['bridge','building'],g:{type:'Point',coordinates:[0,0]},t:{bridge:'yes',building:'yes'}};
  const sign={v:1,id:'d',k:['sign'],g:{type:'Point',coordinates:[0,0]},t:{traffic_sign:'stop'}};
  const hydro2={v:1,id:'e',k:['waterway','dam'],g:{type:'Point',coordinates:[0,0]},t:{waterway:'river'}};

  const line=record=>JSON.stringify(record)+'\n';
  const tile1=line(hydro1)+line(scenery1)+line(shared);
  const tile2=line(sign)+line(hydro2);
  await fsp.writeFile(path.join(root,'tiles','1','1.jsonl'),tile1);
  await fsp.writeFile(path.join(root,'tiles','2','2.jsonl'),tile2);

  const result=await profileWorldTiles({dir:root,progressEvery:0,log:()=>{}});
  const hydroBytes=Buffer.byteLength(line(hydro1))+Buffer.byteLength(line(shared))+Buffer.byteLength(line(hydro2));
  const sceneryBytes=Buffer.byteLength(line(scenery1))+Buffer.byteLength(line(shared));
  const signBytes=Buffer.byteLength(line(sign));

  assert.equal(result.tileCount,2);
  assert.equal(result.rawRecords,5);
  assert.equal(result.parseErrors,0);
  assert.equal(result.groups.hydro.records,3);
  assert.equal(result.groups.hydro.bytes,hydroBytes);
  assert.equal(result.groups.hydro.tilesWithData,2);
  assert.equal(result.groups.scenery.records,2);
  assert.equal(result.groups.scenery.bytes,sceneryBytes);
  assert.equal(result.groups.signs.records,1);
  assert.equal(result.groups.signs.bytes,signBytes);
  assert.deepEqual(result.groups.signs.maxTile,{x:2,y:2});

  console.log('Geofabrik profile QA PASS',JSON.stringify({
    rawBytes:result.rawBytes,
    hydroBytes,
    sceneryBytes,
    signBytes
  }));
}finally{
  await fsp.rm(root,{recursive:true,force:true});
}

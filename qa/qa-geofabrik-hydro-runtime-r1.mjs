import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gzipSync} from 'node:zlib';
import {classifyFeature} from '../tools/geofabrik/build-world-tiles.mjs';
import {
  compactHydroRecordToElements,
  createOfflineHydroSource,
  offlineHydroTileForLatLon
} from '../src/offline-hydro-source.js';
import {createWaterDataService} from '../src/water-data.js';

const LAT=45.5;
const LON=-73.58;
const TILE_SIZE=16000;
const center=offlineHydroTileForLatLon(LAT,LON,TILE_SIZE);

const coastlineFeature={
  type:'Feature',
  id:'way/coastline',
  properties:{natural:'coastline'},
  geometry:{type:'LineString',coordinates:[[LON,LAT],[LON+0.01,LAT+0.01]]}
};
assert.deepEqual(
  classifyFeature(coastlineFeature),
  ['water'],
  'natural=coastline must enter the hydro pack without a new runtime layer'
);
assert.match(
  fs.readFileSync('tools/geofabrik/world-drive-tags-filter.txt','utf8'),
  /natural=water,coastline/,
  'PBF filter must retain natural=coastline'
);

const records=[
  {
    v:1,id:'way/101',k:['waterway'],
    g:{type:'LineString',coordinates:[[LON,LAT],[LON+0.01,LAT+0.005]]},
    t:{waterway:'river',name:'Local River'}
  },
  {
    v:1,id:'relation/202',k:['water'],
    g:{type:'Polygon',coordinates:[[[LON,LAT],[LON+0.005,LAT],[LON+0.005,LAT+0.005],[LON,LAT]]]},
    t:{natural:'water',name:'Local Lake'}
  },
  {
    v:1,id:'way/303',k:['bridge'],
    g:{type:'LineString',coordinates:[[LON,LAT],[LON+0.002,LAT+0.002]]},
    t:{highway:'secondary',bridge:'yes',name:'Local Bridge'}
  },
  {
    v:1,id:'way/404',k:['water'],
    g:{type:'LineString',coordinates:[[LON,LAT],[LON-0.01,LAT+0.004]]},
    t:{natural:'coastline'}
  },
  {
    v:1,id:'relation/505',k:['water'],
    g:{type:'MultiPolygon',coordinates:[
      [[[LON,LAT],[LON+0.002,LAT],[LON,LAT+0.002],[LON,LAT]]],
      [[[LON+0.003,LAT+0.003],[LON+0.005,LAT+0.003],[LON+0.003,LAT+0.005],[LON+0.003,LAT+0.003]]]
    ]},
    t:{natural:'water',name:'Multipart Lake'}
  }
];

const oversizeRecord={
  v:1,id:'way/606',k:['waterway'],
  g:{type:'LineString',coordinates:[[LON-0.01,LAT],[LON+0.01,LAT]]},
  t:{waterway:'river',name:'Oversize River'},
  b:{minLon:LON-0.01,minLat:LAT,maxLon:LON+0.01,maxLat:LAT}
};

const tileBody=gzipSync(Buffer.from(records.map(record=>JSON.stringify(record)).join('\n')+'\n'));
const oversizeBody=gzipSync(Buffer.from(JSON.stringify(oversizeRecord)+'\n'));
const manifest={
  version:2,
  format:'world-drive-osm-hydro-jsonl-gzip-v2',
  sourceTileSizeMeters:TILE_SIZE,
  categories:['water','waterway','bridge','dam'],
  oversize:{file:'oversize.jsonl.gz'},
  files:{oversize:'oversize.jsonl.gz'}
};

function binaryResponse(buffer,status=200){
  return new Response(buffer,{status});
}

let tileRequests=0;
const fetchImpl=async url=>{
  const href=String(url);
  if(href.endsWith('/manifest.json')){
    return new Response(JSON.stringify(manifest),{
      status:200,
      headers:{'content-type':'application/json'}
    });
  }
  if(href.endsWith('/oversize.jsonl.gz'))return binaryResponse(oversizeBody);
  if(href.includes('/tiles/')){
    tileRequests++;
    return binaryResponse(tileBody);
  }
  return new Response('',{status:404});
};

const source=createOfflineHydroSource({
  baseUrl:'http://world-drive.test/world-data/osm-v2/quebec/hydro',
  fetchImpl
});

const local=await source.loadAround(LAT,LON,7000);
assert.equal(local.available,true,'center local hydro tile should make the local source authoritative');
assert.deepEqual(local.centerTile,center,'runtime and packer tile math changed');
assert.equal(local.recordCount,6,'tile duplicates plus oversize must deduplicate by OSM id');
assert.ok(tileRequests>=1&&tileRequests<=4,'exact 7 km Mercator range should load at most four 16 km tiles');

const multipart=compactHydroRecordToElements(records[4]);
assert.equal(multipart.length,2,'MultiPolygon outer rings must remain separate ingest elements');
assert.equal(multipart[0].type,'relation');
assert.equal(multipart[0].geometry[0].lat,LAT);
assert.equal(multipart[0].geometry[0].lon,LON);

const cacheWrites=[];
const cache={
  async get(){return null;},
  async set(namespace,lat,lon,data){cacheWrites.push({namespace,lat,lon,data});return true;},
  async count(){return 0;}
};
let overpassFetches=0;
const overpass={
  async fetchRaw(){overpassFetches++;return {elements:[]};},
  async fetchCached(){overpassFetches++;return {data:null,cached:false};}
};
const statusEl={textContent:''};
const service=createWaterDataService({
  statusEl,
  cache,
  overpass,
  offline:source,
  toLatLon:(x,z)=>({lat:z,lon:x}),
  toWorld:(lat,lon)=>({x:lon*100,z:-lat*100})
});

const result=await service.loadAround(LON,LAT);
assert.equal(result.ok,true,'local hydro visible load failed');
assert.equal(result.source,'local','local hydro must be the primary visible source');
assert.equal(overpassFetches,0,'local hydro hit must not call Overpass');
assert.equal(cacheWrites.length,0,'static local hydro must not be duplicated into IDB');
assert.equal(result.waterCount,5,'river/polygon/MultiPolygon/oversize water ingest changed');
assert.equal(result.bridgeCount,1,'local bridge ingest changed');
assert.equal(result.coastlineCount,1,'local coastline ingest changed');
assert.match(statusEl.textContent,/^Local · /,'HUD must identify the local hydro path');

const prefetched=await service.prefetchAt(LON,LAT);
assert.equal(prefetched.ok,true);
assert.equal(prefetched.source,'local');
assert.equal(overpassFetches,0,'local prefetch must not call Overpass');
assert.ok(source.diagnostics().tileHits>0,'local tile cache must be reused');

let fallbackOverpassFetches=0;
const missingSource=createOfflineHydroSource({
  baseUrl:'http://world-drive.test/missing-hydro',
  fetchImpl:async url=>{
    if(String(url).endsWith('/manifest.json')){
      return new Response(JSON.stringify({...manifest,oversize:{file:null},files:{oversize:null}}),{
        status:200,
        headers:{'content-type':'application/json'}
      });
    }
    return new Response('',{status:404});
  }
});
const fallbackService=createWaterDataService({
  cache,
  offline:missingSource,
  overpass:{
    async fetchRaw(){
      fallbackOverpassFetches++;
      return {elements:[
        {type:'way',id:900,tags:{waterway:'river'},geometry:[{lat:LAT,lon:LON},{lat:LAT+0.001,lon:LON+0.001}]}
      ]};
    },
    async fetchCached(){return {data:null,cached:false};}
  },
  toLatLon:(x,z)=>({lat:z,lon:x}),
  toWorld:(lat,lon)=>({x:lon,z:-lat})
});
const fallback=await fallbackService.loadAround(LON,LAT);
assert.equal(fallback.ok,true,'missing local center tile must preserve Overpass fallback');
assert.equal(fallback.source,'osm');
assert.equal(fallbackOverpassFetches,1,'Overpass fallback must run exactly once for a missing center tile');

let corruptOverpassFetches=0;
const corruptSource=createOfflineHydroSource({
  baseUrl:'http://world-drive.test/corrupt-hydro',
  fetchImpl:async url=>{
    if(String(url).endsWith('/manifest.json')){
      return new Response(JSON.stringify({...manifest,oversize:{file:null},files:{oversize:null}}),{
        status:200,
        headers:{'content-type':'application/json'}
      });
    }
    return new Response('broken',{status:500});
  }
});
const corruptService=createWaterDataService({
  cache,
  offline:corruptSource,
  overpass:{
    async fetchRaw(){corruptOverpassFetches++;return {elements:[]};},
    async fetchCached(){return {data:null,cached:false};}
  },
  toLatLon:(x,z)=>({lat:z,lon:x}),
  toWorld:(lat,lon)=>({x:lon,z:-lat})
});
const corrupt=await corruptService.loadAround(LON,LAT);
assert.equal(corrupt.ok,false,'corrupt local tile must fail visibly');
assert.equal(corrupt.source,'local-error');
assert.equal(corruptOverpassFetches,0,'corrupt local data must not be hidden by an Overpass fallback');

console.log('GEOFABRIK HYDRO RUNTIME QA: PASS',{
  centerTile:center,
  tileRequests,
  localRecords:local.recordCount,
  waterCount:result.waterCount,
  bridgeCount:result.bridgeCount,
  coastlineCount:result.coastlineCount,
  fallbackVerified:true,
  corruptLocalVisible:true
});

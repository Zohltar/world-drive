import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createWaterDataService} from '../src/water-data.js';
import {createWaterRenderer} from '../src/water-renderer.js';

assert.equal(fs.existsSync('src/water-data.js'),true,'root water-data boundary missing');
assert.equal(fs.existsSync('src/water-renderer.js'),true,'root water-renderer boundary missing');
assert.equal(fs.existsSync('src/water/water-data.js'),false,'failed R6.4 nested water-data returned');
assert.equal(fs.existsSync('src/water/water-renderer.js'),false,'failed R6.4 nested water-renderer returned');
assert.equal(typeof createWaterDataService,'function','root createWaterDataService export missing');
assert.equal(typeof createWaterRenderer,'function','root createWaterRenderer export missing');

const cacheWrites=[];
const cache={
  pending:new Map(),
  async get(){return null;},
  async set(namespace,lat,lon,data){cacheWrites.push({namespace,lat,lon,data});return true;},
  async count(){return 0;}
};
let fetches=0;
const overpass={
  async fetchRaw(){
    fetches++;
    return {elements:[
      {
        type:'way',id:101,
        tags:{waterway:'river'},
        geometry:[{lat:45,lon:-73},{lat:45.001,lon:-72.999}]
      },
      {
        type:'way',id:202,
        tags:{highway:'secondary',bridge:'yes'},
        geometry:[{lat:45.002,lon:-73.002},{lat:45.003,lon:-73.001}]
      }
    ]};
  },
  async fetchCached(){return {data:null,cached:false};}
};

const service=createWaterDataService({
  cache,
  overpass,
  toLatLon:(x,z)=>({lat:z,lon:x}),
  toWorld:(lat,lon)=>({x:lon*100,z:-lat*100})
});

const result=await service.loadAround(-73,45);
assert.equal(result.ok,true,'visible hydro load failed');
assert.equal(fetches,1,'visible hydro load must reach Overpass on cache miss');
assert.equal(result.waterCount,1,'river ingestion count changed');
assert.equal(result.bridgeCount,1,'bridge ingestion count changed');
assert.equal(service.waterFeatures.length,1,'river feature missing after load');
assert.equal(service.bridgeFeatures.length,1,'bridge feature missing after load');
assert.equal(cacheWrites.length,1,'successful hydro response should be cached');
assert.equal(cacheWrites[0].namespace,'hydro','hydro cache namespace changed');

service.reset();
assert.equal(service.waterFeatures.length,0,'water reset failed');
assert.equal(service.bridgeFeatures.length,0,'bridge reset failed');

const main=fs.readFileSync('src/main.js','utf8');
assert.ok(main.includes("from './water-data.js'"),'main must keep root water-data boundary');
assert.ok(main.includes("from './water-renderer.js'"),'main must keep root water-renderer boundary');

console.log('R6 WATER ROLLBACK / HYDRO RUNTIME QA: PASS',{
  visibleLoad:true,
  riverCount:result.waterCount,
  bridgeCount:result.bridgeCount,
  rootBoundary:true
});

import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSceneryDataService} from '../src/scenery-data.js';
import {createWaterDataService} from '../src/water-data.js';
import {createWaterRenderer} from '../src/water-renderer.js';

const toWorld=(lat,lon)=>lat===44.5
  ?{x:NaN,z:Infinity}
  :{x:lon*100,z:-lat*100};
const invalidPoints=[
  null,
  {},
  {lat:null,lon:null},
  {lat:'not-a-number',lon:-73},
  {lat:91,lon:-73},
  {lat:44.5,lon:-73}
];
const validPoints=[
  {lat:45,lon:-73},
  {lat:45.001,lon:-72.999},
  {lat:45.002,lon:-73.001}
];

const cache={
  async get(){return null;},
  async set(){return true;},
  async count(){return 0;}
};
const water=createWaterDataService({
  cache,
  overpass:{async fetchRaw(){return null;},async fetchCached(){return {data:null,cached:false};}},
  offline:null,
  toLatLon:(x,z)=>({lat:z,lon:x}),
  toWorld
});
const waterAdded=water.ingest({elements:[
  {type:'way',id:1,tags:{waterway:'river'},geometry:[validPoints[0],...invalidPoints,validPoints[1]]},
  {type:'way',id:2,tags:{natural:'water'},geometry:invalidPoints}
]});
assert.equal(waterAdded.waterAdded,1,'valid hydro feature disappeared while filtering bad coordinates');
assert.equal(water.waterFeatures.length,1);
assert.equal(water.waterFeatures[0].points.length,2,'invalid hydro coordinates reached rendering state');
assert.ok(water.waterFeatures[0].points.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.z)));

const scenery=createSceneryDataService({
  toLatLon:(x,z)=>({lat:z,lon:x}),
  toWorld,
  fetchCached:async()=>({data:null,cached:false}),
  getGeneration:()=>0
});
const sceneryAdded=scenery.ingest({elements:[
  {type:'way',id:3,tags:{building:'yes'},geometry:[validPoints[0],invalidPoints[0],validPoints[1],...invalidPoints.slice(1),validPoints[2]]},
  {type:'node',id:4,tags:{power:'tower'},lat:null,lon:null}
]});
assert.equal(sceneryAdded,1,'valid scenery feature disappeared while filtering bad coordinates');
assert.equal(scenery.features.length,1);
assert.equal(scenery.features[0].points.length,3,'invalid scenery coordinates reached rendering state');
assert.ok(scenery.features[0].points.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.z)));

const group=new THREE.Group();
const material=()=>new THREE.MeshBasicMaterial();
const renderer=createWaterRenderer({
  THREE,
  group,
  waterFeatures:water.waterFeatures,
  coastlineFeatures:water.coastlineFeatures,
  materials:{waterMat:material(),riverMat:material(),coastWaterMat:material()},
  terrainHeight:()=>0,
  getWorldOffset:()=>({x:-7300,z:-4500}),
  waterWidth:()=>8
});
assert.equal(renderer.rebuild(),1,'sanitized hydro feature did not render');
group.traverse(object=>{
  if(!object.geometry)return;
  const positions=object.geometry.getAttribute('position');
  assert.ok(positions.array.every(Number.isFinite),'OSM renderer emitted a non-finite vertex');
  object.geometry.computeBoundingSphere();
  assert.ok(Number.isFinite(object.geometry.boundingSphere?.radius),'OSM renderer emitted a NaN bounding sphere');
});

console.log('OSM GEOMETRY FINITE R1 QA: PASS',{
  hydroInvalidCoordinatesRejected:true,
  sceneryInvalidCoordinatesRejected:true,
  finiteBoundingSphere:true
});

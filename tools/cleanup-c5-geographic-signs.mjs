import fs from 'node:fs';

const mainPath='src/main.js';
let main=fs.readFileSync(mainPath,'utf8');

const oldImport="import { createSignDataService } from './signs.js';";
const newImport="import { createSignDataService, createGeographicSignOrchestrator } from './signs.js';";
if(!main.includes(newImport)){
  if(!main.includes(oldImport))throw new Error('C5.4 signs import anchor missing');
  main=main.replace(oldImport,newImport);
}

const startMarker='function nearestRouteCumToFeature(points){';
const endMarker='// ---------- geographic scenery rendering ----------';
const start=main.indexOf(startMarker);
const end=main.indexOf(endMarker,start);
if(start>=0){
  if(end<0||end<=start)throw new Error('C5.4 geographic sign block end marker missing');
  const removed=main.slice(start,end);
  for(const name of [
    'nearestRouteCumToFeature',
    'collectEndpointLocalitySigns',
    'collectFallbackRiverSigns',
    'addFallbackSpeedSign',
    'addGeographicRoadSigns'
  ]){
    if(!removed.includes(`function ${name}(`))throw new Error(`C5.4 expected function missing from extraction block: ${name}`);
  }
  main=main.slice(0,start)+main.slice(end);
}

const oldCallback="  addGeographicRoadSigns:()=>addGeographicRoadSigns(),";
const newCallback="  addGeographicRoadSigns:()=>geographicSignOrchestrator?.addGeographicRoadSigns(),";
if(main.includes(oldCallback))main=main.replace(oldCallback,newCallback);
if(!main.includes(newCallback))throw new Error('C5.4 road-furniture callback anchor missing');

const furnitureAnchor='// ---------- road furniture facade ----------\nconst roadFurniture=createRoadFurnitureSystem({';
const furnitureReplacement='// ---------- road furniture facade ----------\nlet geographicSignOrchestrator=null;\nconst roadFurniture=createRoadFurnitureSystem({';
if(!main.includes('let geographicSignOrchestrator=null;')){
  if(!main.includes(furnitureAnchor))throw new Error('C5.4 road-furniture facade anchor missing');
  main=main.replace(furnitureAnchor,furnitureReplacement);
}

const wrapperAnchor='const refreshRoadSignsOnly=()=>roadFurniture.refreshRoadSignsOnly();';
const composition=`${wrapperAnchor}\n\ngeographicSignOrchestrator=createGeographicSignOrchestrator({\n  signs:geographicSigns,\n  statusEl:signStatus,\n  getWaterFeatures:()=>waterFeatures,\n  getRouteEndpoints:()=>({start:ROUTE_START,end:ROUTE_END}),\n  getRouteLength:()=>routeLength,\n  nearestRoute,\n  routePointAtCum,\n  roadHeightAt,\n  getActiveRoadMeta:()=>activeRoadMeta,\n  getVehiclePosition:()=>({x:absX,z:absZ}),\n  addRoadSignAt\n});`;
if(!main.includes('geographicSignOrchestrator=createGeographicSignOrchestrator({')){
  if(!main.includes(wrapperAnchor))throw new Error('C5.4 road-furniture wrapper anchor missing');
  main=main.replace(wrapperAnchor,composition);
}

for(const stale of [
  'function nearestRouteCumToFeature(',
  'function collectEndpointLocalitySigns(',
  'function collectFallbackRiverSigns(',
  'function addFallbackSpeedSign(',
  'function addGeographicRoadSigns('
]){
  if(main.includes(stale))throw new Error(`C5.4 stale main ownership remains: ${stale}`);
}

main=main.replace(/[ \t]+$/gm,'').trimEnd()+'\n';
fs.writeFileSync(mainPath,main);
console.log('C5.4 geographic-sign extraction materialized',{
  mainLines:main.split(/\r?\n/).length,
  module:'src/signs.js'
});

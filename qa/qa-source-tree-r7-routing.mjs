import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8').replace(/\r\n/g,'\n');
const exists=rel=>fs.existsSync(path.join(root,rel));

const modules=[
  ['routing.js','createRoutingGeometry'],
  ['routing-service.js','createRoutingService'],
  ['route-lifecycle.js','createRouteLifecycle'],
  ['route-presets.js','MANIC2'],
  ['route-challenge.js','createRouteChallenge'],
  ['geocoding.js','createGeocodingService']
];

const main=read('src/main.js');
for(const [file] of modules){
  const nested=`src/routing/${file}`;
  const facade=`src/${file}`;
  assert.equal(exists(nested),true,`nested routing implementation missing: ${nested}`);
  assert.equal(exists(facade),true,`stable routing root facade missing: ${facade}`);

  const facadeSource=read(facade);
  assert.ok(facadeSource.includes(`export * from './routing/${file}';`),`${facade} must re-export nested implementation`);
  assert.ok(main.includes(`from './${file}'`),`main.js must keep stable root routing import: ${file}`);
  assert.ok(!main.includes(`from './routing/${file}'`),`main.js must not bypass routing facade: ${file}`);

  const impl=read(nested);
  assert.ok(!impl.includes("from '../main.js'")&&!impl.includes("from './main.js'"),`${nested} must not import main.js`);
}

const routing=await import(`${pathToFileURL(path.join(root,'src','routing.js')).href}?qa=${Date.now()}`);
const routingService=await import(`${pathToFileURL(path.join(root,'src','routing-service.js')).href}?qa=${Date.now()}`);
const lifecycle=await import(`${pathToFileURL(path.join(root,'src','route-lifecycle.js')).href}?qa=${Date.now()}`);
const presets=await import(`${pathToFileURL(path.join(root,'src','route-presets.js')).href}?qa=${Date.now()}`);
const challenge=await import(`${pathToFileURL(path.join(root,'src','route-challenge.js')).href}?qa=${Date.now()}`);
const geocoding=await import(`${pathToFileURL(path.join(root,'src','geocoding.js')).href}?qa=${Date.now()}`);

assert.equal(typeof routing.createRoutingGeometry,'function','createRoutingGeometry public export missing');
assert.equal(typeof routing.angleDelta,'function','angleDelta public export missing');
assert.equal(typeof routing.nearestPointOnPolyline,'function','nearestPointOnPolyline public export missing');
assert.equal(typeof routingService.createRoutingService,'function','createRoutingService public export missing');
assert.equal(typeof lifecycle.createRouteLifecycle,'function','createRouteLifecycle public export missing');
assert.equal(typeof challenge.createRouteChallenge,'function','createRouteChallenge public export missing');
assert.equal(typeof geocoding.createGeocodingService,'function','createGeocodingService public export missing');
assert.equal(typeof geocoding.validLatLon,'function','validLatLon public export missing');

const segs=[
  {ax:0,az:0,bx:0,bz:100,len:100,cum:0},
  {ax:0,az:100,bx:100,bz:100,len:100,cum:100}
];
const geometry=routing.createRoutingGeometry({
  getSegments:()=>segs,
  getRouteLength:()=>200
});
const near=geometry.nearestRoute(10,40);
assert.ok(near,'nearestRoute returned no segment');
assert.equal(near.i,0,'nearestRoute selected wrong segment');
assert.equal(Math.round(near.cum),40,'nearestRoute cumulative distance changed');
assert.equal(Math.round(near.d),10,'nearestRoute lateral distance changed');

const quarter=geometry.routePointAt(.25);
assert.deepEqual({x:Math.round(quarter.x),z:Math.round(quarter.z),cum:quarter.cum},{x:0,z:50,cum:50},'routePointAt geometry changed');
const at150=geometry.routePointAtCum(150);
assert.deepEqual({x:Math.round(at150.x),z:Math.round(at150.z),cum:at150.cum},{x:50,z:100,cum:150},'routePointAtCum geometry changed');

assert.ok(Math.abs(routing.angleDelta(Math.PI,-Math.PI))<1e-9,'angleDelta wrapping changed');
const poly=routing.nearestPointOnPolyline(5,50,[{x:0,z:0},{x:0,z:100}]);
assert.equal(Math.round(poly.d),5,'nearestPointOnPolyline distance changed');

assert.equal(geocoding.validLatLon(49.3,-68.3),true,'validLatLon rejected Quebec coordinate');
assert.equal(geocoding.validLatLon(95,-68.3),false,'validLatLon accepted invalid latitude');
const geoService=geocoding.createGeocodingService({minIntervalMs:0});
assert.deepEqual(geoService.parseCoordinateWaypoint('49.3213, -68.3467'),{lat:49.3213,lon:-68.3467,name:'Waypoint'},'coordinate waypoint parsing changed');

assert.equal(presets.MANIC2.name,'Manic‑2','MANIC2 preset identity changed');
assert.equal(presets.MANIC5.name,'Manic‑5','MANIC5 preset identity changed');
assert.ok(Array.isArray(presets.YUNGAS_WAYPOINTS)&&presets.YUNGAS_WAYPOINTS.length===1,'Yungas waypoint preset changed');

console.log('SOURCE TREE R7 ROUTING QA: PASS',{
  stableRootFacades:modules.length,
  nestedImplementations:modules.length,
  mainFacadeBoundary:true,
  geometrySmoke:true,
  geocodingSmoke:true,
  presetsSmoke:true
});

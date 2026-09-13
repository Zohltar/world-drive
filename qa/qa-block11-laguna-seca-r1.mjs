import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  LAGUNA_SECA_START,
  LAGUNA_SECA_END,
  LAGUNA_SECA_CIRCUIT,
  MANIC2,
  MANIC5,
  R169_START,
  R169_END,
  R132_START,
  R132_END,
  YUNGAS_START,
  YUNGAS_END,
  YUNGAS_WAYPOINTS
} from '../src/routing/route-presets.js';

const track=JSON.parse(await readFile(new URL('../src/routing/circuits/laguna-seca.json',import.meta.url),'utf8'));
const lifecycleSource=await readFile(new URL('../src/routing/route-lifecycle.js',import.meta.url),'utf8');
const uiSource=await readFile(new URL('../src/ui/route-planner-ui.js',import.meta.url),'utf8');
const mainSource=await readFile(new URL('../src/main.js',import.meta.url),'utf8');

const R=6371000;
function distanceM(a,b){
  const [lon1,lat1]=a.map(Number);
  const [lon2,lat2]=b.map(Number);
  const p1=lat1*Math.PI/180,p2=lat2*Math.PI/180;
  const dp=(lat2-lat1)*Math.PI/180,dl=(lon2-lon1)*Math.PI/180;
  const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
}
function routeLengthM(points){
  let total=0;
  for(let i=1;i<points.length;i++)total+=distanceM(points[i-1],points[i]);
  return total;
}

assert.equal(track.name,'WeatherTech Raceway Laguna Seca');
assert.equal(track.layout,'Grand Prix');
assert.match(track.source,/OpenStreetMap.*highway=raceway/i);
assert.deepEqual(track.sourceWayIds,[
  10464852,
  1315957508,
  1315957507,
  1315957502,
  1315957506,
  1315957503,
  1315957504,
  1315957505
]);
assert.ok(!track.sourceWayIds.includes(109859349),'pit lane must not be part of the Grand Prix loop');
assert.equal(track.pointCount,track.coordinates.length,'pointCount metadata must match geometry');
assert.ok(track.coordinates.length>=200,'Laguna Seca geometry must retain authored curve detail');
assert.deepEqual(track.coordinates.at(-1),track.coordinates[0],'circuit geometry must close exactly');

const measuredLength=routeLengthM(track.coordinates);
assert.ok(measuredLength>=3580&&measuredLength<=3620,`Laguna Seca loop length must stay near 3.602 km, got ${measuredLength.toFixed(2)} m`);
assert.ok(Math.abs(measuredLength-track.lengthM)<2,`stored length must match coordinates, metadata=${track.lengthM}, measured=${measuredLength.toFixed(2)}`);
let maxSegment=0;
for(let i=1;i<track.coordinates.length;i++)maxSegment=Math.max(maxSegment,distanceM(track.coordinates[i-1],track.coordinates[i]));
assert.ok(maxSegment<=260,`authored loop contains an unexpected coordinate jump: ${maxSegment.toFixed(2)} m`);
assert.ok(Math.abs(maxSegment-track.maxSegmentM)<2,'max-segment metadata must match committed geometry');

assert.equal(LAGUNA_SECA_CIRCUIT.id,'laguna-seca-grand-prix');
assert.equal(LAGUNA_SECA_CIRCUIT.coordinates.length,track.coordinates.length);
assert.equal(LAGUNA_SECA_CIRCUIT.lengthM,track.lengthM);
assert.equal(LAGUNA_SECA_START.lat,LAGUNA_SECA_END.lat,'closed-loop preset start/end latitude must match');
assert.equal(LAGUNA_SECA_START.lon,LAGUNA_SECA_END.lon,'closed-loop preset start/end longitude must match');
assert.equal(LAGUNA_SECA_START.lon,track.coordinates[0][0]);
assert.equal(LAGUNA_SECA_START.lat,track.coordinates[0][1]);

// Existing road presets remain exported and semantically distinct.
for(const point of [MANIC2,MANIC5,R169_START,R169_END,R132_START,R132_END,YUNGAS_START,YUNGAS_END]){
  assert.ok(Number.isFinite(point.lat)&&Number.isFinite(point.lon));
}
assert.equal(YUNGAS_WAYPOINTS.length,1);

// Circuit geometry bypasses live road routing only when explicitly supplied.
assert.match(lifecycleSource,/function normalizeAuthoredCoordinates\(coordinates\)/);
assert.match(lifecycleSource,/if\(authoredCoordinates\)\{[\s\S]*?coordinates=authoredCoordinates;[\s\S]*?\}else\{[\s\S]*?routingService\.fetchRoute/);
assert.match(lifecycleSource,/if\(!authoredCoordinates&&geoDist\(start,end\)<100\)/,'ordinary short-route validation must remain intact');
assert.match(lifecycleSource,/routeAuthoredCoordinates:authoredCoordinates/);
assert.match(lifecycleSource,/routeAuthoredProvider/);

// Planner exposes Laguna Seca without disturbing existing preset buttons.
for(const id of ['preset389Btn','preset169Btn','preset132Btn','presetYungasBtn']){
  assert.ok(uiSource.includes(id),`existing preset wiring disappeared: ${id}`);
}
assert.ok(uiSource.includes("button.id='presetLagunaSecaBtn'"),'Laguna Seca preset button missing');
assert.ok(uiSource.includes("button.textContent='🏁 Laguna Seca · Circuit'"),'Laguna Seca preset label missing');
assert.match(uiSource,/coordinates:LAGUNA_SECA_CIRCUIT\.coordinates/);
assert.match(uiSource,/provider:LAGUNA_SECA_CIRCUIT\.provider/);

// Main remains a thin wiring layer and forwards authored route options.
for(const symbol of ['LAGUNA_SECA_START','LAGUNA_SECA_END','LAGUNA_SECA_CIRCUIT']){
  assert.ok(mainSource.includes(symbol),`main wiring missing ${symbol}`);
}
assert.match(mainSource,/createRequestedRoute\(start,end,waypoints,options\)/,'main route facade must forward circuit options');
assert.match(mainSource,/routeAuthoredCoordinates:ROUTE_AUTHORED_COORDINATES/);
assert.match(mainSource,/routeAuthoredProvider:ROUTE_AUTHORED_PROVIDER/);

console.log('BLOCK 11 LAGUNA SECA CLOSED-LOOP PRESET QA: PASS',{
  points:track.coordinates.length,
  lengthM:Number(measuredLength.toFixed(2)),
  maxSegmentM:Number(maxSegment.toFixed(2)),
  sourceWays:track.sourceWayIds.length,
  pitLaneExcluded:true
});

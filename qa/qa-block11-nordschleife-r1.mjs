import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  NORDSCHLEIFE_START,
  NORDSCHLEIFE_END,
  NORDSCHLEIFE_CIRCUIT,
  LAGUNA_SECA_CIRCUIT,
  MANIC2,
  MANIC5
} from '../src/routing/route-presets.js';

const track=JSON.parse(await readFile(
  new URL('../src/routing/circuits/nordschleife.json',import.meta.url),
  'utf8'
));
const builderSource=await readFile(new URL('../tools/build-nordschleife-snapshot.mjs',import.meta.url),'utf8');
const lifecycleSource=await readFile(new URL('../src/routing/route-lifecycle.js',import.meta.url),'utf8');
const uiSource=await readFile(new URL('../src/ui/route-planner-ui.js',import.meta.url),'utf8');
const mainSource=await readFile(new URL('../src/main.js',import.meta.url),'utf8');

const EARTH=6371000;
function distanceM(a,b){
  const [lon1,lat1]=a.map(Number);
  const [lon2,lat2]=b.map(Number);
  const p1=lat1*Math.PI/180,p2=lat2*Math.PI/180;
  const dp=(lat2-lat1)*Math.PI/180,dl=(lon2-lon1)*Math.PI/180;
  const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*EARTH*Math.asin(Math.min(1,Math.sqrt(h)));
}
function routeLengthM(points){
  let total=0;
  for(let i=1;i<points.length;i++)total+=distanceM(points[i-1],points[i]);
  return total;
}

assert.equal(track.name,'Nürburgring Nordschleife');
assert.equal(track.layout,'Full lap · T13 start/finish');
assert.equal(track.direction,'clockwise');
assert.equal(track.sourceRelationId,38566);
assert.match(track.source,/OpenStreetMap relation 38566/);
assert.equal(track.sourceLicense,'OpenStreetMap contributors · ODbL');
assert.equal(track.startSection,'T13');
assert.equal(track.startWayId,41395670);
assert.equal(track.startNodeId,506284053);
assert.equal(track.officialLengthM,20832);
assert.equal(track.elevationDifferenceM,300);
assert.equal(track.maxClimbPct,18);
assert.equal(track.maxDescentPct,11);
assert.equal(track.sourceWayIds.length,52);
assert.equal(new Set(track.sourceWayIds).size,52,'Nordschleife source ways must remain unique');
assert.equal(track.orderedWays.length,52);
assert.ok(track.orderedWays.every(way=>way.joinGapM===0),'OSM relation contains a disconnected way join');
assert.equal(track.pointCount,track.coordinates.length);
assert.ok(track.coordinates.length>=1000,'Nordschleife snapshot lost source curve detail');
assert.deepEqual(track.coordinates.at(-1),track.coordinates[0],'Nordschleife loop must close exactly');

const measuredLength=routeLengthM(track.coordinates);
assert.ok(measuredLength>=20700&&measuredLength<=20850,`unexpected Nordschleife source length: ${measuredLength.toFixed(2)} m`);
assert.ok(Math.abs(measuredLength-track.lengthM)<2,'stored Nordschleife length no longer matches committed coordinates');
assert.ok(Math.abs(measuredLength-track.officialLengthM)<120,'committed route is not the official 20.832 km full-lap layout');
let maxSegment=0;
let signedArea=0;
for(let i=1;i<track.coordinates.length;i++){
  maxSegment=Math.max(maxSegment,distanceM(track.coordinates[i-1],track.coordinates[i]));
  const [x0,y0]=track.coordinates[i-1];
  const [x1,y1]=track.coordinates[i];
  signedArea+=x0*y1-x1*y0;
}
assert.ok(maxSegment<=550,`Nordschleife source contains an unexpected jump: ${maxSegment.toFixed(2)} m`);
assert.ok(Math.abs(maxSegment-track.maxSegmentM)<2,'stored max segment no longer matches committed geometry');
assert.ok(signedArea<0,'Nordschleife source direction is no longer clockwise');

assert.equal(NORDSCHLEIFE_CIRCUIT.id,'nurburgring-nordschleife-full-lap');
assert.equal(NORDSCHLEIFE_CIRCUIT.routeKind,'circuit');
assert.equal(NORDSCHLEIFE_CIRCUIT.closedLoop,true);
assert.equal(NORDSCHLEIFE_CIRCUIT.civilTraffic,false);
assert.equal(NORDSCHLEIFE_CIRCUIT.lengthM,track.lengthM);
assert.equal(NORDSCHLEIFE_CIRCUIT.officialLengthM,20832);
assert.equal(NORDSCHLEIFE_CIRCUIT.sourceRelationId,38566);
assert.equal(NORDSCHLEIFE_CIRCUIT.coordinates.length,track.coordinates.length);
assert.equal(NORDSCHLEIFE_CIRCUIT.roadSpec.asphaltWidthM,9);
assert.equal(NORDSCHLEIFE_CIRCUIT.roadSpec.shoulderWidthM,0);
assert.equal(NORDSCHLEIFE_CIRCUIT.roadSpec.centerLine,false);
assert.match(NORDSCHLEIFE_CIRCUIT.roadSpec.widthSource,/rarely exceeds 9 m/);
assert.deepEqual(NORDSCHLEIFE_START,NORDSCHLEIFE_END);
assert.equal(NORDSCHLEIFE_START.lon,track.coordinates[0][0]);
assert.equal(NORDSCHLEIFE_START.lat,track.coordinates[0][1]);

// Circuit presets coexist and ordinary public-road defaults remain untouched.
assert.equal(LAGUNA_SECA_CIRCUIT.id,'laguna-seca-grand-prix');
for(const point of [MANIC2,MANIC5]){
  assert.ok(Number.isFinite(point.lat)&&Number.isFinite(point.lon));
}
assert.match(lifecycleSource,/if\(authoredCoordinates\)\{[\s\S]*?coordinates=authoredCoordinates;/);
for(const id of ['preset389Btn','preset169Btn','preset132Btn','presetYungasBtn','presetLagunaSecaBtn']){
  assert.ok(uiSource.includes(id),`existing preset wiring disappeared: ${id}`);
}
assert.ok(uiSource.includes("button.id='presetNordschleifeBtn'"),'Nordschleife preset button missing');
assert.ok(uiSource.includes("button.textContent='🏁 Nordschleife · Circuit'"),'Nordschleife preset label missing');
assert.match(uiSource,/coordinates:NORDSCHLEIFE_CIRCUIT\.coordinates/);
assert.match(uiSource,/civilTraffic:NORDSCHLEIFE_CIRCUIT\.civilTraffic/);
assert.match(uiSource,/roadSpec:NORDSCHLEIFE_CIRCUIT\.roadSpec/);
for(const symbol of ['NORDSCHLEIFE_START','NORDSCHLEIFE_END','NORDSCHLEIFE_CIRCUIT']){
  assert.ok(mainSource.includes(symbol),`main wiring missing ${symbol}`);
}
assert.match(builderSource,/RELATION_ID=38566/);
assert.match(builderSource,/if\(orderedWays\.at\(-1\)\.nodeIds\.at\(-1\)!==orderedWays\[0\]\.nodeIds\[0\]\)/);
assert.match(builderSource,/const t13=orderedWays\.find\(way=>way\.name==='T13'\)/);

console.log('BLOCK 11 NORDSCHLEIFE PRESET R1 QA: PASS',{
  relation:track.sourceRelationId,
  sourceWays:track.sourceWayIds.length,
  points:track.coordinates.length,
  measuredLengthM:Number(measuredLength.toFixed(2)),
  officialLengthM:track.officialLengthM,
  maxSegmentM:Number(maxSegment.toFixed(2)),
  direction:track.direction,
  asphaltWidthM:NORDSCHLEIFE_CIRCUIT.roadSpec.asphaltWidthM,
  civilTraffic:NORDSCHLEIFE_CIRCUIT.civilTraffic
});

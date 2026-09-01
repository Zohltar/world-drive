import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CIVIL_TRAFFIC_MAX_ACTIVE,
  CIVIL_TRAFFIC_LANE_OFFSET_M,
  CIVIL_TRAFFIC_FIRST_SPAWN_MIN_SEC,
  CIVIL_TRAFFIC_FIRST_SPAWN_MAX_SEC,
  CIVIL_TRAFFIC_COOLDOWN_MIN_SEC,
  CIVIL_TRAFFIC_COOLDOWN_MAX_SEC,
  civilTrafficLaneOffset,
  civilTrafficSpawnPlan,
  civilTrafficCurveSpeed,
  civilTrafficFirstSpawnSec,
  civilTrafficCooldownSec
} from './src/traffic/civil-traffic.js';

assert.equal(CIVIL_TRAFFIC_MAX_ACTIVE,2,'Traffic must remain capped at two active cars');
assert.ok(CIVIL_TRAFFIC_LANE_OFFSET_M>1.5&&CIVIL_TRAFFIC_LANE_OFFSET_M<2.0,'traffic lane center must stay inside a two-lane 7.5 m road');
assert.ok(civilTrafficLaneOffset(1)>0,'same-direction traffic must use the rendered player-right lane');
assert.ok(civilTrafficLaneOffset(-1)<0,'oncoming traffic must use the rendered opposite lane');

const same=civilTrafficSpawnPlan({playerCum:1000,routeLength:5000,kind:'ahead',distanceRandom:0,speedRandom:0});
assert.ok(same,'same-direction spawn should be possible well inside the route');
assert.equal(same.direction,1);
assert.ok(same.cum>=1360&&same.cum<=1690,'same-direction traffic must appear far ahead');
assert.ok(same.laneOffset>0,'same-direction spawn must be in the corrected right lane');
assert.ok(same.cruiseSpeed*3.6>=54&&same.cruiseSpeed*3.6<=76,'same-direction cruise speed must be ordinary civil-road pace');

const opposite=civilTrafficSpawnPlan({playerCum:1000,routeLength:5000,kind:'oncoming',distanceRandom:1,speedRandom:1});
assert.ok(opposite,'oncoming spawn should be possible well inside the route');
assert.equal(opposite.direction,-1);
assert.ok(opposite.cum>=1360&&opposite.cum<=1690,'oncoming traffic must begin far ahead before approaching');
assert.ok(opposite.laneOffset<0,'oncoming spawn must be in the corrected opposite lane');
assert.ok(opposite.cruiseSpeed*3.6>=62&&opposite.cruiseSpeed*3.6<=88,'oncoming cruise speed must be ordinary civil-road pace');

const nearEnd=civilTrafficSpawnPlan({playerCum:4800,routeLength:5000,kind:'oncoming',distanceRandom:0,speedRandom:.5});
assert.equal(nearEnd,null,'traffic must not materialize beyond the route end');

const straightSpeed=civilTrafficCurveSpeed(22,0,0);
const hairpinSpeed=civilTrafficCurveSpeed(22,0,.72);
assert.ok(Math.abs(straightSpeed-22)<1e-9,'straight road must preserve cruise speed');
assert.ok(hairpinSpeed<straightSpeed,'tight curves must reduce civil traffic speed');
assert.ok(hairpinSpeed>=8.3,'curve slowing must retain a practical minimum road speed');

assert.equal(civilTrafficFirstSpawnSec(0),CIVIL_TRAFFIC_FIRST_SPAWN_MIN_SEC);
assert.equal(civilTrafficFirstSpawnSec(1),CIVIL_TRAFFIC_FIRST_SPAWN_MAX_SEC);
assert.equal(civilTrafficCooldownSec(0),CIVIL_TRAFFIC_COOLDOWN_MIN_SEC);
assert.equal(civilTrafficCooldownSec(1),CIVIL_TRAFFIC_COOLDOWN_MAX_SEC);
assert.ok(CIVIL_TRAFFIC_COOLDOWN_MIN_SEC>=30,'normal traffic cadence must stay deliberately sparse');

const facadeSource=fs.readFileSync(new URL('./src/traffic/civil-traffic.js',import.meta.url),'utf8');
const localSource=fs.readFileSync(new URL('./src/traffic/civil-traffic-local.js',import.meta.url),'utf8');
const source=`${facadeSource}\n${localSource}`;
assert.ok(source.includes("getObjectByName('Object_7')"),'traffic must reuse the authored front Sonata lens mesh');
assert.ok(source.includes("getObjectByName('Object_46')"),'traffic must reuse the authored inner rear Sonata lens mesh');
assert.ok(source.includes("getObjectByName('Object_33')"),'traffic must reuse the authored outer rear Sonata lens mesh');
assert.ok(source.includes('new THREE.ShaderMaterial('),'traffic lamp glow must be texture-filtered on authored meshes');
assert.ok(source.includes('texture2D(uMap,vUv)'),'traffic glow must sample authored lamp textures');
assert.ok(!source.includes('new THREE.SphereGeometry(.085'),'traffic must not reintroduce generic visible lamp bulbs');
assert.ok(source.includes('new THREE.SpotLight(0xf8fbff,0,72,.36,.68,1.0)'),'traffic headlights must retain the pilotable Sonata SpotLight contract');
assert.ok(source.includes('target.position.set(side*.45,.15,30);'),'Sonata traffic headlight target must match the pilotable Sonata');
assert.ok(source.includes('beam.position.set(side*.68,.66,2.25);'),'Sonata traffic beam position must match the pilotable Sonata');
assert.ok(source.includes('beam.light.intensity=nightOn?night*95:0;'),'traffic beam intensity must match the pilotable Sonata');
assert.ok(source.includes('beam.light.distance=65+night*15;'),'traffic beam distance must match the pilotable Sonata');
assert.ok(!source.includes('new THREE.PointLight('),'traffic must not reintroduce point-light pools');
assert.ok(source.includes("mode:'traffic-r7-variety-pool'"),'local traffic diagnostics mode must retain R7 variety pool');
assert.ok(facadeSource.includes("mode:'traffic-mp1-shared-variety'"),'traffic facade must identify shared multiplayer mode');
assert.ok(source.includes('rearRoadLightSpill:false'),'traffic diagnostics must report rear road spill disabled');

console.log('PASS Traffic MP1 sparse civil traffic policy');
console.log('  - max two active civilian traffic cars');
console.log('  - validated R7 local engine remains intact behind the MP facade');
console.log('  - authored Sonata lighting contract remains intact inside the variety pool');
console.log('  - forward headlight beams retain the pilotable Sonata contract');
console.log('  - no PointLight or rear red road spill remains');
console.log('  - normal respawn cooldown remains 32-68 seconds');

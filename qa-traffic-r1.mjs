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
} from './src/civil-traffic.js';

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

const source=fs.readFileSync(new URL('./src/civil-traffic.js',import.meta.url),'utf8');
assert.ok(source.includes("getObjectByName('Object_7')"),'Traffic R3 must reuse the authored front Sonata lens mesh');
assert.ok(source.includes("getObjectByName('Object_46')"),'Traffic R3 must reuse the authored inner rear Sonata lens mesh');
assert.ok(source.includes("getObjectByName('Object_33')"),'Traffic R3 must reuse the authored outer rear Sonata lens mesh');
assert.ok(source.includes('new THREE.ShaderMaterial('),'Traffic R3 lamp glow must be texture-filtered on authored meshes');
assert.ok(source.includes('texture2D(uMap,vUv)'),'Traffic R3 glow must sample the original authored lamp texture');
assert.ok(!source.includes('new THREE.SphereGeometry(.085'),'Traffic R3 must not reintroduce generic visible lamp bulbs');
assert.ok(source.includes('new THREE.SpotLight('),'traffic headlights must retain real scene SpotLights for road illumination');
assert.ok(source.includes('new THREE.PointLight('),'traffic lamps must retain low-cost body/road spill lights');
assert.ok(source.includes("mode:'traffic-r3-authored-textured-lamps'"),'Traffic R3 diagnostics mode must identify authored textured lamps');
assert.ok(source.includes('castShadow=false'),'traffic scene lights must not cast expensive dynamic shadows');

console.log('PASS Traffic R3 sparse civil traffic policy');
console.log('  - max two active Sonata traffic cars');
console.log('  - corrected rendered lane ownership is deterministic');
console.log('  - traffic appears 360-690 m ahead, not beside the player');
console.log('  - authored Sonata front/rear textured lenses provide the visible glow');
console.log('  - no generic visible bulb geometry remains');
console.log('  - invisible no-shadow scene lights still illuminate body panels and road');
console.log('  - normal respawn cooldown remains 32-68 seconds');

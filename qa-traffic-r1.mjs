import assert from 'node:assert/strict';
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

assert.equal(CIVIL_TRAFFIC_MAX_ACTIVE,2,'Traffic R1 must remain capped at two active cars');
assert.ok(CIVIL_TRAFFIC_LANE_OFFSET_M>1.5&&CIVIL_TRAFFIC_LANE_OFFSET_M<2.0,'traffic lane center must stay inside a two-lane 7.5 m road');
assert.ok(civilTrafficLaneOffset(1)<0,'same-direction traffic must use the player right lane');
assert.ok(civilTrafficLaneOffset(-1)>0,'oncoming traffic must use its own right lane / player left lane');

const same=civilTrafficSpawnPlan({playerCum:1000,routeLength:5000,kind:'ahead',distanceRandom:0,speedRandom:0});
assert.ok(same,'same-direction spawn should be possible well inside the route');
assert.equal(same.direction,1);
assert.ok(same.cum>=1360&&same.cum<=1690,'same-direction traffic must appear far ahead');
assert.ok(same.laneOffset<0,'same-direction spawn must be in the right lane');
assert.ok(same.cruiseSpeed*3.6>=54&&same.cruiseSpeed*3.6<=76,'same-direction cruise speed must be ordinary civil-road pace');

const opposite=civilTrafficSpawnPlan({playerCum:1000,routeLength:5000,kind:'oncoming',distanceRandom:1,speedRandom:1});
assert.ok(opposite,'oncoming spawn should be possible well inside the route');
assert.equal(opposite.direction,-1);
assert.ok(opposite.cum>=1360&&opposite.cum<=1690,'oncoming traffic must begin far ahead before approaching');
assert.ok(opposite.laneOffset>0,'oncoming spawn must be in the opposite lane');
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

console.log('PASS Traffic R1 sparse civil traffic policy');
console.log('  - max two active Sonata traffic cars');
console.log('  - right-hand lane ownership is deterministic');
console.log('  - traffic appears 360-690 m ahead, not beside the player');
console.log('  - ordinary cruise speeds slow naturally for sharp curves');
console.log('  - normal respawn cooldown remains 32-68 seconds');

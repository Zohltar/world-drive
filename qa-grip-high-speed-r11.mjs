import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  driftForceSideslipGate,
  driftTireForceAuthority
} from './src/physics/drift-force-coupling.js';
import {driftKinematicCoupling} from './src/driving-runtime-base.js';

const DEG=Math.PI/180;

function regime(sideslipDeg,forceCoupledSlide){
  const sideslipRad=sideslipDeg*DEG;
  const gate=driftForceSideslipGate(sideslipRad);
  const authority=driftTireForceAuthority({sideslipRad,forceCoupledSlide});
  const kinematicScale=driftKinematicCoupling({sideslipRad,forceCoupledSlide});
  const forceDominated=authority>.12||kinematicScale<.88;
  return {sideslipDeg,forceCoupledSlide,gate,authority,kinematicScale,forceDominated};
}

// A small high-speed trajectory correction can briefly report high tire
// utilization even though chassis sideslip remains tiny. That must NOT promote
// the drift solver or freeze momentum on the previous trajectory.
const gentle=regime(2.5,.82);
assert.ok(gentle.gate<.01,'2.5 degree chassis sideslip must stay outside drift-force authority');
assert.ok(gentle.authority<.03,'high tire utilization alone must not promote the drift solver');
assert.ok(gentle.kinematicScale>.98,'normal high-speed correction must retain near-linear trajectory coupling');
assert.equal(gentle.forceDominated,false,'small correction must not enter force-dominated drift mode');

// Around five degrees we are at the edge of the normal road-car regime. Keep
// the transition progressive and below the runtime drift-switch threshold.
const edge=regime(5,.82);
assert.ok(edge.authority<.12,'five degree sideslip must not abruptly switch to drift authority');
assert.ok(edge.kinematicScale>.88,'five degree sideslip must not abruptly suppress normal kinematics');
assert.equal(edge.forceDominated,false,'five degree correction must remain in the normal trajectory regime');

// A real drift still needs the physical per-wheel solver. R7 countersteer
// behavior must remain substantially authoritative at large chassis sideslip.
const drift=regime(20,.35);
assert.ok(drift.gate>.99,'20 degree drift must fully open the sideslip gate');
assert.ok(drift.authority>.45,'20 degree drift must retain substantial R7 tire-force authority');
assert.ok(drift.kinematicScale<.88,'real drift must suppress bicycle-model trajectory locking');
assert.equal(drift.forceDominated,true,'real drift must remain force dominated');

const runtime=fs.readFileSync('src/driving-runtime-base.js','utf8');
assert.ok(
  runtime.includes('(driftPhysicalAuthority>.12||driftKinematicScale<.88)'),
  'runtime drift switch must depend on gated drift authority, not tire saturation alone'
);
assert.ok(
  !runtime.includes('driftPhysicalAuthority>.12||forceCoupledSlide>.10||driftKinematicScale<.88'),
  'legacy saturation-only drift switch must be removed'
);

console.log('GRIP R11 HIGH-SPEED TRAJECTORY QA: PASS', {gentle,edge,drift});

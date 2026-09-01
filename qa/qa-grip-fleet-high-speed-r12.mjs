import assert from 'node:assert/strict';
import {
  TIRE_PROFILE_CATALOG,
  VEHICLE_TIRE_PROFILE
} from '../src/physics/tire-model.js';
import {
  driftForceSideslipGate,
  driftTireForceAuthority
} from '../src/physics/drift-force-coupling.js';
import {driftKinematicCoupling} from '../src/driving-runtime-base.js';

const RAD_TO_DEG=180/Math.PI;
const reports=[];

for(const [vehicleId,tireId] of Object.entries(VEHICLE_TIRE_PROFILE)){
  const tire=TIRE_PROFILE_CATALOG[tireId];
  assert.ok(tire,`${vehicleId}: missing tire profile ${tireId}`);

  // A tire at its declared peak slip angle is still in ordinary cornering:
  // it may be saturated, but the chassis must not yet be promoted into the
  // large-sideslip drift trajectory path. This is the exact high-speed crab
  // regression seen on lower-grip cars after R11.
  const sideslipRad=tire.peakSlipAngleRad;
  const forceCoupledSlide=.82;
  const gate=driftForceSideslipGate(sideslipRad);
  const authority=driftTireForceAuthority({sideslipRad,forceCoupledSlide});
  const kinematicScale=driftKinematicCoupling({sideslipRad,forceCoupledSlide});
  const forceDominated=authority>.12||kinematicScale<.88;

  assert.ok(
    authority<.12,
    `${vehicleId}: peak-slip ordinary cornering incorrectly enters drift authority (${(sideslipRad*RAD_TO_DEG).toFixed(1)} deg, authority=${authority})`
  );
  assert.ok(
    kinematicScale>.88,
    `${vehicleId}: peak-slip ordinary cornering suppresses normal trajectory coupling (${kinematicScale})`
  );
  assert.equal(
    forceDominated,
    false,
    `${vehicleId}: tire peak must not create force-dominated crab drift`
  );

  reports.push({
    vehicleId,
    tireId,
    peakSlipDeg:+(sideslipRad*RAD_TO_DEG).toFixed(1),
    gate:+gate.toFixed(3),
    authority:+authority.toFixed(3),
    kinematicScale:+kinematicScale.toFixed(3)
  });
}

// Deep sideslip still belongs to the physical drift solver for every tire.
for(const deg of [15,20,30]){
  const sideslipRad=deg*Math.PI/180;
  const authority=driftTireForceAuthority({sideslipRad,forceCoupledSlide:.55});
  const kinematicScale=driftKinematicCoupling({sideslipRad,forceCoupledSlide:.55});
  if(deg>=20){
    assert.ok(authority>.45,`${deg} deg real drift lost physical tire authority`);
    assert.ok(kinematicScale<.88,`${deg} deg real drift retained too much bicycle coupling`);
  }
}

console.log('GRIP R12 FLEET HIGH-SPEED CRAB-DRIFT QA: PASS');
console.table(reports);

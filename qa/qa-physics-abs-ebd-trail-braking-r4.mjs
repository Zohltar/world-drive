import assert from 'node:assert/strict';
import {createVehicleSystem} from '../src/vehicles/vehicle-system.js';
import {effectiveServiceBrakeShares} from '../src/physics/per-wheel-shadow-solver.js';

const G=9.80665;
const vehicle=createVehicleSystem({initialId:'wrx'}).physics;
const axles=vehicle.axles.map(axle=>({...axle}));
const axleLoads=[.65,.35];
const configured=axles.map(axle=>axle.brakeShare);

const feasible=effectiveServiceBrakeShares(
  vehicle,
  axles,
  axleLoads,
  -.35*G,
  [.40*G,.20*G]
);
assert.deepEqual(feasible,configured,
  'feasible trail braking must preserve the configured mechanical bias');

const rearConstrained=effectiveServiceBrakeShares(
  vehicle,
  axles,
  axleLoads,
  -.35*G,
  [.50*G,.10*G]
);
assert.ok(Math.abs(rearConstrained[0]-(5/7))<1e-12,
  `rear capacity excess was not minimally moved forward: ${rearConstrained}`);
assert.ok(Math.abs(rearConstrained.reduce((sum,value)=>sum+value,0)-1)<1e-12,
  'capacity-constrained EBD shares are not normalized');

const globallyConstrained=effectiveServiceBrakeShares(
  vehicle,
  axles,
  axleLoads,
  -.80*G,
  [.50*G,.20*G]
);
assert.ok(Math.abs(globallyConstrained[0]-(5/7))<1e-12,
  `globally constrained EBD did not follow measured reserve: ${globallyConstrained}`);

const noAbsVehicle={...vehicle,absEnabled:false};
const noAbs=effectiveServiceBrakeShares(
  noAbsVehicle,
  axles,
  axleLoads,
  -.80*G,
  [.01*G,.01*G]
);
assert.deepEqual(noAbs,configured,
  'ABS OFF must preserve the fixed hydraulic split even beyond tire capacity');

for(const shares of [feasible,rearConstrained,globallyConstrained,noAbs]){
  assert.ok(shares.every(value=>Number.isFinite(value)&&value>=0&&value<=1),
    `EBD produced an invalid share: ${shares}`);
}

console.log('PHYSICS ABS/EBD TRAIL-BRAKING R4 QA: PASS',{
  configured:configured.map(value=>Number(value.toFixed(3))),
  feasible:feasible.map(value=>Number(value.toFixed(3))),
  rearConstrained:rearConstrained.map(value=>Number(value.toFixed(3))),
  globallyConstrained:globallyConstrained.map(value=>Number(value.toFixed(3))),
  noAbs:noAbs.map(value=>Number(value.toFixed(3)))
});

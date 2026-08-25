import assert from 'node:assert/strict';
import { clutchShockThrottle } from '../src/transmission-controller.js';

const fullShock=clutchShockThrottle({
  vehicleId:'wrx',profileType:'combustion',driveDirection:1,
  bodyLongitudinalSpeed:-5,requestedThrottle:1,transmittedThrottle:1
});
assert(fullShock>2.20&&fullShock<=2.25+1e-9,'WRX full clutch dump should request about 2.25x nominal torque');

const mildShock=clutchShockThrottle({
  vehicleId:'wrx',profileType:'combustion',driveDirection:1,
  bodyLongitudinalSpeed:-1.5,requestedThrottle:.55,transmittedThrottle:.55
});
assert(mildShock>.55&&mildShock<1.1,'partial pedal/opposition should blend clutch shock progressively');

const forward=clutchShockThrottle({
  vehicleId:'wrx',profileType:'combustion',driveDirection:1,
  bodyLongitudinalSpeed:8,requestedThrottle:1,transmittedThrottle:1
});
assert.equal(forward,1,'normal forward acceleration must remain unchanged');

const reverseGear=clutchShockThrottle({
  vehicleId:'wrx',profileType:'combustion',driveDirection:-1,
  bodyLongitudinalSpeed:-5,requestedThrottle:-1,transmittedThrottle:-1
});
assert.equal(reverseGear,-1,'reverse gear must not receive forward clutch-shock scaling');

const otherCar=clutchShockThrottle({
  vehicleId:'civic',profileType:'combustion',driveDirection:1,
  bodyLongitudinalSpeed:-5,requestedThrottle:1,transmittedThrottle:1
});
assert.equal(otherCar,1,'other combustion vehicles must keep their existing calibration');

const wrxAccel=6.36;
const wrxLongitudinalLimit=9.47;
const requestedAccel=wrxAccel*fullShock;
assert(requestedAccel>wrxLongitudinalLimit*1.4,'full clutch dump must materially exceed tire longitudinal capacity');

console.table({
  full_clutch_dump:{throttle:+fullShock.toFixed(3),requested_accel:+requestedAccel.toFixed(2),tire_limit:wrxLongitudinalLimit},
  partial:{throttle:+mildShock.toFixed(3)},
  normal_forward:{throttle:forward}
});
console.log('V21.29 WRX CLUTCH SHOCK QA: PASS');

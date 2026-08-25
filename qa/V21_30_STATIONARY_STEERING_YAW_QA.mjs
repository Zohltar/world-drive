import assert from 'node:assert/strict';
import { lowSpeedYawAuthority } from '../src/vehicle-dynamics.js';

assert.equal(lowSpeedYawAuthority(0),0,'standstill must have zero steering yaw authority');
assert.equal(lowSpeedYawAuthority(.18),0,'parking deadband must remain yaw-free');
assert(lowSpeedYawAuthority(.35)>0&&lowSpeedYawAuthority(.35)<.2,'yaw authority should return gently once rolling');
assert(lowSpeedYawAuthority(.8)>.5&&lowSpeedYawAuthority(.8)<1,'parking-speed authority should ramp progressively');
assert(lowSpeedYawAuthority(1.2)>.99,'normal low-speed steering authority should be fully restored by 1.2 m/s');
assert.equal(lowSpeedYawAuthority(-0.1),0,'reverse standstill neighborhood must also be yaw-free');

console.log('V21.30 stationary steering yaw QA passed');

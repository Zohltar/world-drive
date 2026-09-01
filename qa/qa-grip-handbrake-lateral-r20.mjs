import assert from 'node:assert/strict';
import {lockedTireGroundForce} from '../src/physics/braking-tire-control.js';

const fz=5000,mu=.78;

const forward=lockedTireGroundForce({bodyX:0,bodyZ:12,normalLoadN:fz,slideMu:mu,lateralScale:.46});
const forwardIso=lockedTireGroundForce({bodyX:0,bodyZ:12,normalLoadN:fz,slideMu:mu,lateralScale:1});
assert.ok(Math.abs(forward.forceZ-forwardIso.forceZ)<1e-9,'handbrake lateral scaling must not reduce longitudinal locked-tire braking');
assert.ok(Math.abs(forward.forceX)<1e-9);

const sideways=lockedTireGroundForce({bodyX:12,bodyZ:0,normalLoadN:fz,slideMu:mu,lateralScale:.46});
const sidewaysIso=lockedTireGroundForce({bodyX:12,bodyZ:0,normalLoadN:fz,slideMu:mu,lateralScale:1});
assert.ok(Math.abs(sideways.forceX/sidewaysIso.forceX-.46)<1e-9,'cross-tread handbrake sliding force must follow lateral scale');
assert.ok(Math.abs(sideways.forceZ)<1e-9);

const diagonal=lockedTireGroundForce({bodyX:8,bodyZ:8,normalLoadN:fz,slideMu:mu,lateralScale:.46});
assert.ok(diagonal.forceX*8+diagonal.forceZ*8<0,'anisotropic locked-tire force must remain dissipative');
assert.ok(Math.hypot(diagonal.forceX,diagonal.forceZ)<=mu*fz+1e-9,'anisotropic force must stay inside kinetic-friction capacity');

console.log('GRIP R20 HANDBRAKE LOCKED-TIRE LATERAL FRICTION QA: PASS',{
  forwardBrake:forward.forceZ,
  sidewaysScale:sideways.forceX/sidewaysIso.forceX,
  diagonalMagnitude:Math.hypot(diagonal.forceX,diagonal.forceZ)
});

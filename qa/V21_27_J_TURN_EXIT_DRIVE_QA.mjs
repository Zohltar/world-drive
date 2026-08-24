import assert from 'node:assert/strict';
import {
  bodyRelativeLongitudinalSpeed,
  bodyAxisDriveProjection
} from '../src/driving-runtime.js';

const EPS=1e-9;

function projectedForwardAccel({speed,heading,velocityHeading,accel=6.36}){
  const projection=bodyAxisDriveProjection({heading,velocityHeading});
  return accel*projection;
}

// Canonical forward travel: forward throttle accelerates forward.
{
  const speed=12;
  const heading=0;
  const velocityHeading=0;
  assert(bodyRelativeLongitudinalSpeed({speed,heading,velocityHeading})>0);
  assert(projectedForwardAccel({speed,heading,velocityHeading})>0);
}

// Canonical reverse travel: forward throttle must oppose reverse momentum.
{
  const speed=-12;
  const heading=0;
  const velocityHeading=0;
  assert(bodyRelativeLongitudinalSpeed({speed,heading,velocityHeading})<0);
  assert(projectedForwardAccel({speed,heading,velocityHeading})>0,
    'positive scalar accel must bring negative reverse speed toward zero');
}

// Post-J-turn representation: scalar speed may still be positive while the
// momentum axis is opposite the chassis. Forward throttle must NOT increase
// that rearward momentum; its projection must be negative.
{
  const speed=12;
  const heading=Math.PI;
  const velocityHeading=0;
  const bodySpeed=bodyRelativeLongitudinalSpeed({speed,heading,velocityHeading});
  const accel=projectedForwardAccel({speed,heading,velocityHeading});
  assert(bodySpeed<0,'post-J-turn sample must still be moving rearward relative to chassis');
  assert(accel<0,'forward throttle must reduce positive scalar rearward momentum');
}

// At 90 degrees of residual momentum, longitudinal drive cannot magically add
// speed along the momentum axis. The projected scalar force should be ~zero.
{
  const accel=projectedForwardAccel({
    speed:12,
    heading:Math.PI/2,
    velocityHeading:0
  });
  assert(Math.abs(accel)<EPS,'sideways momentum must not receive synthetic longitudinal acceleration');
}

// Once momentum is recanonicalized to the body-forward axis at zero crossing,
// the same throttle immediately accelerates forward again.
{
  const speed=0;
  const heading=Math.PI;
  const velocityHeading=Math.PI;
  const accel=projectedForwardAccel({speed,heading,velocityHeading});
  assert(accel>0,'canonicalized J-turn exit must accelerate forward');
}

console.log('V21.27 J-TURN EXIT DRIVE QA: PASS');

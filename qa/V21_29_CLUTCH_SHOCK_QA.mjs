import assert from 'node:assert/strict';
import { clutchShockMultiplierFromMismatch } from '../src/transmission-controller.js';
import { semiAutoClutchReleaseMultiplier } from '../src/driving-runtime.js';

const base={idleRpm:850,redlineRpm:6700,throttle:1};

const synchronized=clutchShockMultiplierFromMismatch({
  ...base,
  freeRpm:4200,
  coupledRpm:4050,
  opposingTravel:false
});
assert.ok(synchronized<1.35,`synchronized release too harsh: ${synchronized}`);

const highMismatch=clutchShockMultiplierFromMismatch({
  ...base,
  freeRpm:6200,
  coupledRpm:2300,
  opposingTravel:false
});
assert.ok(highMismatch>2.7,`large RPM mismatch too soft: ${highMismatch}`);

const opposing=clutchShockMultiplierFromMismatch({
  ...base,
  freeRpm:6200,
  coupledRpm:1800,
  opposingTravel:true
});
assert.ok(opposing>highMismatch,`opposing travel should increase shock: ${opposing} <= ${highMismatch}`);
assert.ok(opposing<=3.6,'shock cap exceeded');

const initial=semiAutoClutchReleaseMultiplier({
  releaseRemaining:.095,
  releaseDuration:.095,
  shockMultiplier:opposing
});
const mid=semiAutoClutchReleaseMultiplier({
  releaseRemaining:.0475,
  releaseDuration:.095,
  shockMultiplier:opposing
});
const end=semiAutoClutchReleaseMultiplier({
  releaseRemaining:0,
  releaseDuration:.095,
  shockMultiplier:opposing
});

assert.ok(initial>3,'initial clutch bite should be strong');
assert.ok(mid>1&&mid<initial,'shock envelope should decay rapidly');
assert.equal(end,1,'shock should be gone after release window');

console.log('V21.29 clutch shock QA passed',{
  synchronized,
  highMismatch,
  opposing,
  initial,
  mid,
  end
});

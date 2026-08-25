import assert from 'node:assert/strict';
import { semiAutoClutchReleaseMultiplier } from '../src/driving-runtime.js';

const fullOpposed=semiAutoClutchReleaseMultiplier({
  releaseRemaining:.22,
  releaseDuration:.22,
  requestedThrottle:1,
  baseThrottle:1,
  bodyLongitudinalSpeed:-5
});
assert(fullOpposed>2.20&&fullOpposed<=2.25+1e-9,'full clutch dump against rearward travel should request ~2.25x torque');

const aligned=semiAutoClutchReleaseMultiplier({
  releaseRemaining:.22,
  releaseDuration:.22,
  requestedThrottle:1,
  baseThrottle:1,
  bodyLongitudinalSpeed:8
});
assert(aligned>1&&aligned<1.4,'normal release should reconnect firmly without the opposed-motion shock');

const expired=semiAutoClutchReleaseMultiplier({
  releaseRemaining:0,
  requestedThrottle:1,
  baseThrottle:1,
  bodyLongitudinalSpeed:-5
});
assert.equal(expired,1,'release transient must disappear when timer expires');

const partial=semiAutoClutchReleaseMultiplier({
  releaseRemaining:.11,
  releaseDuration:.22,
  requestedThrottle:.5,
  baseThrottle:.5,
  bodyLongitudinalSpeed:-3
});
assert(partial>1&&partial<1.5,'partial throttle / half release time must blend progressively');

console.table({
  full_opposed:+fullOpposed.toFixed(3),
  aligned:+aligned.toFixed(3),
  partial:+partial.toFixed(3),
  expired:+expired.toFixed(3)
});
console.log('V21.29 SEMI AUTO CLUTCH QA: PASS');

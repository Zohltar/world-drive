import assert from 'node:assert/strict';
import {semiAutoClutchReleaseMultiplier} from '../src/driving-runtime.js';
import {clutchShockMultiplierFromMismatch} from '../src/transmission-controller.js';

const shock=clutchShockMultiplierFromMismatch({
  freeRpm:6000,coupledRpm:1500,idleRpm:900,redlineRpm:6500,
  throttle:1,opposingTravel:true,gain:2.65,travelBonus:.42,maxMultiplier:3.6
});
assert.ok(shock>2&&shock<=3.6,'large RPM mismatch must create a strong bounded clutch shock');

const full=semiAutoClutchReleaseMultiplier({releaseRemaining:.095,releaseDuration:.095,shockMultiplier:shock});
assert.ok(Math.abs(full-shock)<1e-9,'release transient must start at published shock multiplier');

const half=semiAutoClutchReleaseMultiplier({releaseRemaining:.0475,releaseDuration:.095,shockMultiplier:shock});
assert.ok(half>1&&half<full,'clutch shock must decay progressively during engagement');

const expired=semiAutoClutchReleaseMultiplier({releaseRemaining:0,releaseDuration:.095,shockMultiplier:shock});
assert.equal(expired,1,'release transient must disappear when timer expires');

const noMismatch=clutchShockMultiplierFromMismatch({freeRpm:1800,coupledRpm:1750,idleRpm:900,redlineRpm:6500,throttle:1,opposingTravel:false});
assert.equal(noMismatch,1,'negligible RPM mismatch must not manufacture clutch shock');

console.log('V21.31 SEMI AUTO CLUTCH QA: PASS',{shock,full,half,expired});
